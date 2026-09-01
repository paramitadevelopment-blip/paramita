import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 역할(role) 변경 권한.
 *
 * PUT /api/users는 "본인 정보는 관리자가 아니어도 고칠 수 있다"를 허용한다.
 * role을 그 허용 범위에 넣으면 지사·DB담당자 계정이 자기 요청에 role을 실어
 * 보내 스스로 권한을 올릴 수 있다. 관리자만 남의 역할을 바꿀 수 있어야 한다.
 *
 * `lib`의 순수 함수 테스트로는 이 권한 경계가 안 잡히므로 라우트를 직접 부른다.
 */

let currentUser: { id: number; role: string } | null = { id: 1, role: 'admin' };
/** 두 번째 from('users') 호출(update)에 실린 값을 붙잡아 둔다. */
let updatePatch: any = null;
/**
 * 첫 번째 from('users') 조회(대상자)가 돌려줄 값. admin 보호 분기를 피하려고
 * 'admin'이 아닌 이름을 쓴다. role은 "지금까지" 값 — DB담당자→지사 강등 같은
 * 테스트가 바꿔 쓴다.
 */
let targetUser = { username: 'branch_staff', department: '파라인슈', role: 'user' };

let usersFromCallCount = 0;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== 'users') {
        // department 존재 확인, 소속 변경 이력 남기기 등.
        return {
          select: () => ({ eq: () => Promise.resolve({ count: 1, data: [], error: null }) }),
          insert: () => Promise.resolve({ error: null }),
        };
      }

      usersFromCallCount++;
      if (usersFromCallCount === 1) {
        // 대상자 조회: .select('username, department').eq('id', userId).single()
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: targetUser, error: null }),
            }),
          }),
        };
      }

      // 실제 수정: .update(patch).eq('id', userId).select()
      return {
        update: (patch: any) => {
          updatePatch = patch;
          return {
            eq: () => ({
              select: () => Promise.resolve({ data: [{ ...targetUser, ...patch }], error: null }),
            }),
          };
        },
      };
    },
  }),
}));

vi.mock('@/lib/jwt', () => ({ getUserFromRequest: () => currentUser }));
vi.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => true }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { PUT } = await import('@/app/api/users/route');

const putReq = (body: unknown) =>
  new Request('http://localhost/api/users', {
    method: 'PUT',
    body: JSON.stringify(body),
  }) as any;

beforeEach(() => {
  currentUser = { id: 1, role: 'admin' };
  updatePatch = null;
  usersFromCallCount = 0;
  targetUser = { username: 'branch_staff', department: '파라인슈', role: 'user' };
});

describe('역할은 본인이 스스로 못 바꾼다', () => {
  it('지사 계정이 자기 role을 DB담당자로 바꾸려 하면 403', async () => {
    currentUser = { id: 5, role: 'user' };

    const res = await PUT(putReq({ id: 5, role: 'staff' }));

    expect(res.status).toBe(403);
    expect(updatePatch).toBeNull();
  });

  it('DB담당자 계정이 자기 role을 지사로 되돌리려 해도 403', async () => {
    currentUser = { id: 6, role: 'staff' };

    const res = await PUT(putReq({ id: 6, role: 'user' }));

    expect(res.status).toBe(403);
  });
});

describe('관리자로는 이 화면으로 못 만든다', () => {
  it("role: 'admin' 은 관리자가 보내도 400", async () => {
    currentUser = { id: 1, role: 'admin' };

    const res = await PUT(putReq({ id: 7, role: 'admin' }));

    expect(res.status).toBe(400);
    expect(updatePatch).toBeNull();
  });

  it('알 수 없는 역할 값도 400', async () => {
    const res = await PUT(putReq({ id: 7, role: 'superadmin' }));

    expect(res.status).toBe(400);
  });
});

describe('관리자가 지정하면 정상 처리된다', () => {
  it("지사 계정을 DB담당자로 바꿀 수 있다", async () => {
    const res = await PUT(putReq({ id: 7, role: 'staff' }));

    expect(res.status).toBe(200);
    expect(updatePatch).toMatchObject({ role: 'staff' });
  });

  it("지사 계정을 서브관리자로 바꿀 수 있다", async () => {
    const res = await PUT(putReq({ id: 7, role: 'subadmin' }));

    expect(res.status).toBe(200);
    expect(updatePatch).toMatchObject({ role: 'subadmin', department: '관리자' });
  });

  it('role을 안 보내면 그대로 둔다', async () => {
    const res = await PUT(putReq({ id: 7, name: '홍길동' }));

    expect(res.status).toBe(200);
    expect(updatePatch).not.toHaveProperty('role');
  });
});

/**
 * DB담당자의 소속은 'DB담당자'로 고정한다. 관리자 계정 소속이 '관리자'인 것과
 * 같은 자리다.
 */
describe('DB담당자/서브관리자로 바뀌면 소속도 같이 바뀐다', () => {
  it("지사를 DB담당자로 올리면 소속이 'DB담당자'로 채워진다", async () => {
    const res = await PUT(putReq({ id: 7, role: 'staff' }));

    expect(res.status).toBe(200);
    expect(updatePatch).toMatchObject({ role: 'staff', department: 'DB담당자' });
  });

  it('다른 소속을 같이 보내도 무시하고 DB담당자로 채운다', async () => {
    const res = await PUT(putReq({ id: 7, role: 'staff', department: '경기' }));

    expect(res.status).toBe(200);
    expect(updatePatch).toMatchObject({ department: 'DB담당자' });
  });

  it("지사를 서브관리자로 올리면 소속이 '관리자'로 채워진다", async () => {
    const res = await PUT(putReq({ id: 7, role: 'subadmin' }));

    expect(res.status).toBe(200);
    expect(updatePatch).toMatchObject({ role: 'subadmin', department: '관리자' });
  });

  it('서브관리자에게 다른 소속을 같이 보내도 무시하고 관리자로 채운다', async () => {
    const res = await PUT(putReq({ id: 7, role: 'subadmin', department: '경기' }));

    expect(res.status).toBe(200);
    expect(updatePatch).toMatchObject({ role: 'subadmin', department: '관리자' });
  });
});

/** DB담당자에서 지사로 내려올 때는 새 소속을 반드시 받아야 한다. */
describe('DB담당자를 지사로 내리려면 소속을 새로 받아야 한다', () => {
  it('소속 없이 role만 지사로 보내면 400', async () => {
    targetUser = { username: 'branch_staff', department: 'DB담당자', role: 'staff' };

    const res = await PUT(putReq({ id: 7, role: 'user' }));

    expect(res.status).toBe(400);
    expect(updatePatch).toBeNull();
  });

  it('소속을 같이 보내면 통과한다', async () => {
    targetUser = { username: 'branch_staff', department: 'DB담당자', role: 'staff' };

    const res = await PUT(putReq({ id: 7, role: 'user', department: '경기' }));

    expect(res.status).toBe(200);
    expect(updatePatch).toMatchObject({ role: 'user', department: '경기' });
  });
});
