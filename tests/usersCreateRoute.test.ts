import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 계정 생성 시 소속 필수 여부.
 *
 * DB담당자는 파일 업로드 화면 하나만 쓰므로 소속이 없어도 된다. 지사는 소속이
 * 없으면 어느 지사 사람인지 알 방법이 없어 그대로 필수다. `lib`의 순수 함수
 * 테스트로는 이 분기가 안 잡히므로 라우트를 직접 부른다.
 */

let insertedRows: any[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      insert: (rows: any[]) => {
        insertedRows = rows;
        return Promise.resolve({ data: rows, error: null });
      },
    }),
  }),
}));

vi.mock('bcryptjs', () => ({ hash: async () => 'hashed' }));

vi.mock('@/lib/jwt', () => ({ getUserFromRequest: () => ({ id: 1, role: 'admin' }) }));
vi.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => true }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { POST } = await import('@/app/api/users/route');

const postReq = (body: unknown) =>
  new Request('http://localhost/api/users', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as any;

beforeEach(() => {
  insertedRows = [];
});

const base = { username: 'staff01', password: 'pw123456', name: '홍담당' };

describe('DB담당자는 소속을 고르지 않는다', () => {
  it("department를 안 보내도 201 — 소속은 'DB담당자'로 서버가 채운다", async () => {
    const res = await POST(postReq({ ...base, role: 'staff' }));

    expect(res.status).toBe(201);
    expect(insertedRows[0]).toMatchObject({ role: 'staff', department: 'DB담당자' });
  });

  /** 관리자 계정 소속이 '관리자'인 것과 같은 자리라, 다른 값을 보내도 서버가 덮어쓴다. */
  it('department를 다른 값으로 보내도 무시하고 DB담당자로 채운다', async () => {
    const res = await POST(postReq({ ...base, role: 'staff', department: '파라인슈' }));

    expect(res.status).toBe(201);
    expect(insertedRows[0]).toMatchObject({ department: 'DB담당자' });
  });
});

describe('서브관리자는 소속이 관리자로 자동 지정된다', () => {
  it("department를 안 보내도 201 — 소속은 '관리자'로 서버가 채운다", async () => {
    const res = await POST(postReq({ ...base, role: 'subadmin' }));

    expect(res.status).toBe(201);
    expect(insertedRows[0]).toMatchObject({ role: 'subadmin', department: '관리자' });
  });

  it('department를 다른 값으로 보내도 무시하고 관리자로 채운다', async () => {
    const res = await POST(postReq({ ...base, role: 'subadmin', department: '파라인슈' }));

    expect(res.status).toBe(201);
    expect(insertedRows[0]).toMatchObject({ role: 'subadmin', department: '관리자' });
  });
});

describe('지사는 여전히 소속이 필수다', () => {
  it('role을 안 보내면(기본 지사) department 없이 400', async () => {
    const res = await POST(postReq(base));

    expect(res.status).toBe(400);
    expect(insertedRows).toHaveLength(0);
  });

  it("role: 'user' 를 명시해도 department 없이 400", async () => {
    const res = await POST(postReq({ ...base, role: 'user' }));

    expect(res.status).toBe(400);
  });
});
