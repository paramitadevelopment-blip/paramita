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
/** 조회가 돌려줄 알림 줄. 테스트마다 바꾼다. */
let noticeRows: any[] = [];
/** users 조회가 돌려줄 줄. 확인한 사람 이름을 붙일 때 쓴다. */
let userRows: any[] = [];
let orders: Array<[string, { ascending?: boolean }]> = [];

/** 체이닝되는 쿼리 빌더 흉내. 걸린 조건을 그대로 기록한다. */
function makeQuery(table?: string) {
  const result: any = { data: noticeRows, error: null, count: noticeRows.length };
  const q: any = {
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return q;
    },
    is: (col: string, val: unknown) => {
      filters.push([`is:${col}`, val]);
      return q;
    },
    in: (col: string, val: unknown) => {
      filters.push([`in:${col}`, val]);
      return Promise.resolve({ data: table === 'users' ? userRows : [], error: null });
    },
    or: () => q,
    order: (col: string, opts: any) => {
      orders.push([col, opts]);
      return q;
    },
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
        select: () => makeQuery(table),
        update: (patch: any) => {
          updatePatch = patch;
          return makeQuery(table);
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
  orders = [];
  updatePatch = null;
  noticeRows = [];
  userRows = [];
  currentUser = { id: 169, role: 'user' };
});

describe('목록 정렬', () => {
  it('생년월일 정렬이 지원된다', async () => {
    await GET(req('http://localhost/api/reapply-notices?sortBy=birth&sortOrder=asc'));
    expect(orders).toContainEqual(['birth', { ascending: true }]);
  });

  it('전화번호 정렬이 지원된다', async () => {
    await GET(req('http://localhost/api/reapply-notices?sortBy=tel1&sortOrder=desc'));
    expect(orders).toContainEqual(['tel1', { ascending: false }]);
  });

  it('확인(read_at) 정렬이 지원된다', async () => {
    await GET(req('http://localhost/api/reapply-notices?sortBy=read_at&sortOrder=asc'));
    expect(orders).toContainEqual(['read_at', { ascending: true }]);
  });

  it('허용되지 않은 정렬 열은 기본값(applied_at)으로 물러선다', async () => {
    await GET(req('http://localhost/api/reapply-notices?sortBy=malicious_col&sortOrder=asc'));
    expect(orders).toContainEqual(['applied_at', { ascending: true }]);
  });
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
    // 확인한 사람이 없으면 이름을 물을 일도 없다. 아래 '확인자' 테스트와 달리
    // 여기서는 users 조회가 소속 확인 때문에 일어나는지만 본다.
    noticeRows = [{ id: 1, read_at: null, read_by: null }];

    await GET(req());

    expect(tables).not.toContain('users');
  });
});

/**
 * 누가 확인했나.
 *
 * read_by에는 id만 들어 있다. 지사는 자기들끼리 누가 봤는지 알아야 두 사람이
 * 같은 고객에게 또 연락하지 않고, 관리자는 어느 지사의 누가 봤는지 알아야 한다.
 */
describe('확인한 사람', () => {
  it('id를 이름으로 바꿔 내려준다', async () => {
    currentUser = { id: 1, role: 'admin' };
    noticeRows = [{ id: 1, read_at: '2026-08-31T04:00:00Z', read_by: 7 }];
    userRows = [{ id: 7, name: '김담당', username: 'para1' }];

    const body = await (await GET(req())).json();

    expect(body.data[0].read_by_name).toBe('김담당');
  });

  /** 아직 아무도 안 본 건은 이름이 없다. 그 자체가 '안 봤다'는 신호다. */
  it('확인 안 한 건은 이름이 없다', async () => {
    currentUser = { id: 1, role: 'admin' };
    noticeRows = [{ id: 1, read_at: null, read_by: null }];

    const body = await (await GET(req())).json();

    expect(body.data[0].read_by_name).toBeNull();
  });

  /** 계정을 지워도 '확인함'과 시각은 남아야 한다. 이름만 비는 게 맞다. */
  it('계정이 없어졌어도 터지지 않는다', async () => {
    currentUser = { id: 1, role: 'admin' };
    noticeRows = [{ id: 1, read_at: '2026-08-31T04:00:00Z', read_by: 99 }];
    userRows = [];

    const body = await (await GET(req())).json();

    expect(body.data[0].read_by_name).toBeNull();
    expect(body.data[0].read_at).toBe('2026-08-31T04:00:00Z');
  });

  /** 이름이 비어 있으면 아이디로 대신한다. 빈칸보다는 누구인지 가리킨다. */
  it('이름이 없으면 아이디를 쓴다', async () => {
    currentUser = { id: 1, role: 'admin' };
    noticeRows = [{ id: 1, read_at: '2026-08-31T04:00:00Z', read_by: 7 }];
    userRows = [{ id: 7, name: '', username: 'para1' }];

    const body = await (await GET(req())).json();

    expect(body.data[0].read_by_name).toBe('para1');
  });

  /** 20줄이면 20번 왕복하는 걸 막는다. id를 모아 한 번만 묻는다. */
  it('여러 줄이어도 users 는 한 번만 읽는다', async () => {
    currentUser = { id: 1, role: 'admin' };
    noticeRows = [
      { id: 1, read_at: 'x', read_by: 7 },
      { id: 2, read_at: 'x', read_by: 7 },
      { id: 3, read_at: 'x', read_by: 8 },
    ];
    userRows = [
      { id: 7, name: '김담당', username: 'a' },
      { id: 8, name: '이담당', username: 'b' },
    ];

    const body = await (await GET(req())).json();

    expect(tables.filter((t) => t === 'users')).toHaveLength(1);
    expect(body.data.map((r: any) => r.read_by_name)).toEqual(['김담당', '김담당', '이담당']);
  });
});
