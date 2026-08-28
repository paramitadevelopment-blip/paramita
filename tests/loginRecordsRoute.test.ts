import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 로그인 기록 API의 권한 격리.
 *
 * 이 라우트는 모든 사용자의 접속 이력 — 아이디·소속·IP를 들고 있다.
 * 관리자 확인이 빠지면 지사 사용자가 남의 접속 이력을 전부 받아 간다.
 * 사이드바에서 메뉴를 숨기는 건 UX일 뿐이라 `lib` 테스트로는 안 잡힌다.
 * 그래서 라우트를 직접 부른다.
 */

/** 이번 요청에서 supabase 에 걸린 것들 */
let filters: Array<[string, unknown]> = [];
let orders: string[] = [];
let nullsLast: string[] = [];
let tables: string[] = [];
let selected = '';

function makeQuery() {
  const result: any = { data: [], error: null, count: 0 };
  const q: any = {
    eq: (col: string, val: unknown) => {
      filters.push([col, val]);
      return q;
    },
    or: (expr: string) => {
      filters.push(['or', expr]);
      return q;
    },
    order: (col: string, opts?: { nullsFirst?: boolean }) => {
      orders.push(col);
      if (opts?.nullsFirst === false) nullsLast.push(col);
      return q;
    },
    range: () => Promise.resolve(result),
  };
  return q;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      tables.push(table);
      return {
        select: (columns: string) => {
          selected = columns;
          return makeQuery();
        },
      };
    },
  }),
}));

/** 이 요청을 보낸 사람. 테스트마다 바꾼다. */
let currentUser: { id: number; role: string } | null = { id: 1, role: 'admin' };

vi.mock('@/lib/jwt', () => ({ getUserFromRequest: () => currentUser }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { GET } = await import('@/app/api/login-records/route');

const req = (url = 'http://localhost/api/login-records') => new Request(url) as any;

beforeEach(() => {
  filters = [];
  orders = [];
  nullsLast = [];
  tables = [];
  selected = '';
  currentUser = { id: 1, role: 'admin' };
});

describe('누가 볼 수 있나', () => {
  it('로그인 안 했으면 401', async () => {
    currentUser = null;

    expect((await GET(req())).status).toBe(401);
  });

  /** 이게 빠지면 지사 사용자가 남의 접속 이력을 전부 받아 간다. */
  it('지사 사용자는 403', async () => {
    currentUser = { id: 169, role: 'user' };

    expect((await GET(req())).status).toBe(403);
  });

  it('거절당하면 조회 자체를 하지 않는다', async () => {
    currentUser = { id: 169, role: 'user' };

    await GET(req());

    expect(tables).toEqual([]);
  });

  it('관리자는 통과한다', async () => {
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(tables).toContain('login_records');
  });
});

describe('성공·실패 갈라 보기', () => {
  it('기본은 전부 본다', async () => {
    await GET(req());

    expect(filters.some(([col]) => col === 'success')).toBe(false);
  });

  it('성공만 보기', async () => {
    await GET(req('http://localhost/api/login-records?status=success'));

    expect(filters).toContainEqual(['success', true]);
  });

  /** 이 화면의 쓰임새다 — 누가 계속 틀리고 있는지. */
  it('실패만 보기', async () => {
    await GET(req('http://localhost/api/login-records?status=failed'));

    expect(filters).toContainEqual(['success', false]);
  });

  it('모르는 값은 전부 보기로 둔다', async () => {
    await GET(req('http://localhost/api/login-records?status=이상한값'));

    expect(filters.some(([col]) => col === 'success')).toBe(false);
  });
});

describe('검색', () => {
  it('아이디·이름·소속·IP 를 함께 뒤진다', async () => {
    await GET(req('http://localhost/api/login-records?search=para'));

    const [, expr] = filters.find(([col]) => col === 'or')!;
    for (const col of ['username', 'user_name', 'user_department', 'ip_address']) {
      expect(expr).toContain(`${col}.ilike.%para%`);
    }
  });

  it('빈 검색어는 조건을 안 건다', async () => {
    await GET(req('http://localhost/api/login-records?search=   '));

    expect(filters.some(([col]) => col === 'or')).toBe(false);
  });
});

describe('정렬', () => {
  it('기본은 최근 순', async () => {
    await GET(req());

    expect(orders[0]).toBe('logged_in_at');
  });

  it('허용한 열로만 정렬한다', async () => {
    await GET(req('http://localhost/api/login-records?sortBy=ip_address'));

    expect(orders[0]).toBe('ip_address');
  });

  /**
   * sortBy 는 사용자가 보내는 값이라 그대로 넘기면 안 된다.
   * 흰 목록에 없으면 기본값으로 돌린다.
   */
  it('허용하지 않은 열은 무시한다', async () => {
    await GET(req('http://localhost/api/login-records?sortBy=password_hash'));

    expect(orders[0]).toBe('logged_in_at');
  });

  it('결과로도 정렬한다', async () => {
    await GET(req('http://localhost/api/login-records?sortBy=success'));

    expect(orders[0]).toBe('success');
  });

  /**
   * 기기는 화면에 `OS · 브라우저`로 붙여 보여준다. 한 열만 걸면 같은 Windows
   * 안에서 브라우저가 뒤섞여 보이므로 두 열을 순서대로 건다.
   */
  it('기기는 OS·브라우저 순으로 정렬한다', async () => {
    await GET(req('http://localhost/api/login-records?sortBy=device'));

    expect(orders.slice(0, 2)).toEqual(['os_name', 'browser_name']);
  });

  /** 동점이면 순서가 흔들려 페이지를 넘길 때 행이 겹치거나 빠진다. */
  it('동점을 가르는 마지막 기준이 있다', async () => {
    await GET(req());

    expect(orders[orders.length - 1]).toBe('id');
  });

  it('기기로 정렬해도 마지막 기준은 남아 있다', async () => {
    await GET(req('http://localhost/api/login-records?sortBy=device'));

    expect(orders[orders.length - 1]).toBe('id');
  });

  /**
   * 기기를 못 읽은 행은 값이 비어 있다. 그냥 두면 내림차순일 때 빈 칸이 맨 위에
   * 몰려 첫 화면이 비어 보인다.
   */
  it('값이 없는 행은 어느 방향이든 뒤로 보낸다', async () => {
    await GET(req('http://localhost/api/login-records?sortBy=device&sortOrder=asc'));
    expect(nullsLast).toEqual(['os_name', 'browser_name']);

    nullsLast = [];
    await GET(req('http://localhost/api/login-records?sortBy=device'));
    expect(nullsLast).toEqual(['os_name', 'browser_name']);
  });
});

/** 필요한 열만 내려준다. `select('*')` 로 두면 나중에 열이 늘 때 딸려 나간다. */
describe('내려주는 값', () => {
  it('열을 하나하나 지정한다', async () => {
    await GET(req());

    expect(selected).not.toContain('*');
    expect(selected).toContain('username');
    expect(selected).toContain('logged_in_at');
  });
});
