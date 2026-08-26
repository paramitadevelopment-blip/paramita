import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 재신청 고객 API의 권한 격리.
 *
 * 이 라우트는 다른 지사 고객의 개인정보를 들고 있다. 소속 조건이 빠지면
 * 아무나 전부 받아 갈 수 있는데, `lib`의 순수 함수 테스트로는 그게 안 잡힌다.
 * 실제로 오늘 그 자리에서 두 번 사고가 났다 — 열 이름이 틀려 조회가 죽었고,
 * 미들웨어 허용 목록을 안 열어 지사가 화면에 못 들어왔다.
 *
 * 그래서 라우트를 직접 부른다. Supabase와 토큰만 가짜로 끼운다.
 */

/** 이번 요청에서 supabase에 걸린 조건들 */
let filters: Array<[string, unknown]> = [];
let tables: string[] = [];
let updatePatch: any = null;

/** 체이닝되는 쿼리 빌더 흉내. 걸린 조건을 그대로 기록한다. */
function makeQuery() {
  const result: any = { data: [], error: null, count: 0 };
  const q: any = {
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return q;
    },
    is: (col: string, val: unknown) => {
      filters.push([`is:${col}`, val]);
      return q;
    },
    or: () => q,
    order: () => q,
    range: () => Promise.resolve(result),
    select: () => Promise.resolve({ data: [{ id: 1 }], error: null }),
    single: () => Promise.resolve({ data: { department: '파라인슈' }, error: null }),
    then: (fn: any) => Promise.resolve(result).then(fn),
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      tables.push(table);
      return {
        select: () => makeQuery(),
        update: (patch: any) => {
          updatePatch = patch;
          return makeQuery();
        },
      };
    },
  }),
}));

/** 이 요청을 보낸 사람. 테스트마다 바꾼다. */
let currentUser: { id: number; role: string } | null = { id: 169, role: 'user' };

vi.mock('@/lib/jwt', () => ({ getUserFromRequest: () => currentUser }));
vi.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => true }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { GET, PATCH } = await import('@/app/api/reapply-notices/route');

const req = (url = 'http://localhost/api/reapply-notices') =>
  new Request(url) as any;

const patchReq = (body: unknown) =>
  new Request('http://localhost/api/reapply-notices', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as any;

beforeEach(() => {
  filters = [];
  tables = [];
  updatePatch = null;
  currentUser = { id: 169, role: 'user' };
});

describe('목록 조회 권한', () => {
  it('로그인 안 했으면 401', async () => {
    currentUser = null;

    const res = await GET(req());

    expect(res.status).toBe(401);
  });

  /** 이게 빠지면 지사 사용자가 남의 고객 개인정보를 전부 받아 간다. */
  it('지사 사용자는 자기 소속 조건이 반드시 걸린다', async () => {
    await GET(req());

    expect(filters).toContainEqual(['assigned_group', '파라인슈']);
  });

  it('관리자는 소속 조건 없이 전체를 본다', async () => {
    currentUser = { id: 1, role: 'admin' };

    await GET(req());

    expect(filters.some(([col]) => col === 'assigned_group')).toBe(false);
  });

  it('관리자가 소속을 고르면 그 소속만 본다', async () => {
    currentUser = { id: 1, role: 'admin' };

    await GET(req('http://localhost/api/reapply-notices?group=한울부원'));

    expect(filters).toContainEqual(['assigned_group', '한울부원']);
  });

  /**
   * 지사 사용자가 group 파라미터를 직접 붙여 남의 소속을 요청할 수 있다.
   * 그건 무시하고 자기 소속으로 고정해야 한다.
   */
  it('지사 사용자가 남의 소속을 요청해도 자기 것만 본다', async () => {
    await GET(req('http://localhost/api/reapply-notices?group=한울부원'));

    expect(filters).toContainEqual(['assigned_group', '파라인슈']);
    expect(filters).not.toContainEqual(['assigned_group', '한울부원']);
  });

  it('안 읽은 것만 보기가 조건으로 걸린다', async () => {
    await GET(req('http://localhost/api/reapply-notices?unreadOnly=true'));

    expect(filters).toContainEqual(['is:read_at', null]);
  });
});

describe('확인 처리 권한', () => {
  it('로그인 안 했으면 401', async () => {
    currentUser = null;

    expect((await PATCH(patchReq({ id: 1 }))).status).toBe(401);
  });

  it('잘못된 id는 400', async () => {
    for (const id of [0, -1, 'abc', null]) {
      expect((await PATCH(patchReq({ id }))).status).toBe(400);
    }
  });

  /** id만 보내면 남의 소속 건도 읽음 처리할 수 있다. 소속 조건을 함께 걸어야 한다. */
  it('지사 사용자는 자기 소속 조건이 함께 걸린다', async () => {
    await PATCH(patchReq({ id: 7 }));

    expect(filters).toContainEqual(['id', 7]);
    expect(filters).toContainEqual(['assigned_group', '파라인슈']);
  });

  it('이미 확인한 건은 건드리지 않는다 — 처음 본 시각이 덮이면 추적이 안 된다', async () => {
    await PATCH(patchReq({ id: 7 }));

    expect(filters).toContainEqual(['is:read_at', null]);
  });

  it('누가 언제 봤는지 남긴다', async () => {
    await PATCH(patchReq({ id: 7 }));

    expect(updatePatch.read_by).toBe(169);
    expect(updatePatch.read_at).toBeTruthy();
  });

  it('관리자는 소속 조건 없이 처리한다', async () => {
    currentUser = { id: 1, role: 'admin' };

    await PATCH(patchReq({ id: 7 }));

    expect(filters.some(([col]) => col === 'assigned_group')).toBe(false);
  });
});

describe('어느 표를 보는가', () => {
  it('알림 표를 읽는다', async () => {
    await GET(req());

    expect(tables).toContain('reapply_notices');
  });

  /**
   * 소속은 토큰이 아니라 그때그때 DB에서 읽는다. 토큰에 넣어 두면 소속을 옮긴
   * 뒤에도 옛 토큰이 살아 있는 동안 예전 소속 것을 계속 볼 수 있다.
   */
  it('지사 사용자면 소속을 users 에서 확인한다', async () => {
    await GET(req());

    expect(tables).toContain('users');
  });

  it('관리자면 소속을 확인하지 않는다', async () => {
    currentUser = { id: 1, role: 'admin' };

    await GET(req());

    expect(tables).not.toContain('users');
  });
});
