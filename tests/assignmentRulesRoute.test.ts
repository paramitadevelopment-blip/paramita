import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 배정 규칙 API 권한 + 검증.
 *
 * 여기서 저장한 이름이 departments에 없으면, 그 소속으로 배정된 건은 배포에서
 * 에러도 없이 사라진다(파일을 이름으로 찾기 때문이다). 그래서 저장하는 자리에서
 * 막아야 한다 — 배포 시점에는 이미 늦다.
 */

let currentUser: { id: number; role: string; username: string } | null = {
  id: 1,
  role: 'admin',
  username: 'admin',
};
let csrfValid = true;
let requestBody: any = { rules: [] };

let departmentRows: any[] = [
  { group_name: '경기', is_admin: false },
  { group_name: '굿모닝제너럴', is_admin: false },
  { group_name: '파라인슈', is_admin: false },
  { group_name: '파라인슈', is_admin: false },
  { group_name: '관리자', is_admin: true },
  { group_name: '담당자', is_admin: false },
  { group_name: '이외지역', is_admin: false },
];

let regionInserts: any[][] = [];
let ageInserts: any[][] = [];
let deletedTables: string[] = [];
let metaUpdates: any[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => {
        const q: any = {
          order: () => Promise.resolve({ data: departmentRows, error: null }),
          eq: () => ({
            single: () =>
              Promise.resolve({ data: { updated_at: '2026-09-03T00:00:00Z', updated_by: 'admin' } }),
          }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
        return q;
      },
      insert: (rows: any[]) => {
        if (table === 'assignment_region_rules') regionInserts.push(rows);
        if (table === 'assignment_age_rules') ageInserts.push(rows);
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        not: () => {
          deletedTables.push(table);
          return Promise.resolve({ error: null });
        },
      }),
      update: (patch: any) => ({
        eq: () => {
          metaUpdates.push(patch);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

vi.mock('@/lib/jwt', () => ({ getUserFromRequest: () => currentUser }));
vi.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => csrfValid }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { GET, PUT } = await import('@/app/api/assignment-rules/route');

const getReq = () => new Request('http://localhost/api/assignment-rules') as any;
const putReq = () =>
  new Request('http://localhost/api/assignment-rules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  }) as any;

beforeEach(() => {
  currentUser = { id: 1, role: 'admin', username: 'admin' };
  csrfValid = true;
  requestBody = { rules: [] };
  regionInserts = [];
  ageInserts = [];
  deletedTables = [];
  metaUpdates = [];
});

describe('분류·배포를 하는 사람만 규칙을 다룬다', () => {
  it('로그인 안 했으면 401', async () => {
    currentUser = null;
    expect((await GET(getReq())).status).toBe(401);
  });

  it('관리자는 200', async () => {
    expect((await GET(getReq())).status).toBe(200);
  });

  it('서브관리자도 200 — 분류·배포를 하는 사람이다', async () => {
    currentUser = { id: 2, role: 'subadmin', username: 'sub' };
    expect((await GET(getReq())).status).toBe(200);
  });

  it('DB담당자는 403 — 원본만 넘기는 역할이다', async () => {
    currentUser = { id: 3, role: 'staff', username: 'staff' };
    expect((await GET(getReq())).status).toBe(403);
    expect((await PUT(putReq())).status).toBe(403);
  });

  it('지사는 403', async () => {
    currentUser = { id: 4, role: 'user', username: 'branch' };
    expect((await GET(getReq())).status).toBe(403);
  });

  it('CSRF 토큰이 없으면 저장은 403', async () => {
    csrfValid = false;
    expect((await PUT(putReq())).status).toBe(403);
  });
});

describe('배정할 수 있는 소속만 보여준다', () => {
  it('관리자·담당자·이외지역은 빼고, 나뉜 조직은 한 번만 나온다', async () => {
    const body = await (await GET(getReq())).json();

    expect(body.groups).toEqual(['경기', '굿모닝제너럴', '파라인슈']);
    expect(body.groups).not.toContain('관리자');
    expect(body.groups).not.toContain('담당자');
    expect(body.groups).not.toContain('이외지역');
  });

  it('설정이 없는 소속도 빈 배열로 나온다 — 빠뜨리면 화면이 없는 소속으로 본다', async () => {
    const body = await (await GET(getReq())).json();
    for (const rule of body.rules) {
      expect(Array.isArray(rule.regions)).toBe(true);
      expect(Array.isArray(rule.ageBrackets)).toBe(true);
    }
  });
});

describe('저장할 때 값을 검증한다', () => {
  it('없는 소속이면 400 — 배포에서 조용히 사라지는 걸 막는다', async () => {
    requestBody = {
      rules: [{ group: '없는지사', regions: ['서울'], ageBrackets: ['under70'] }],
    };
    const res = await PUT(putReq());
    expect(res.status).toBe(400);
    expect(regionInserts).toHaveLength(0);
  });

  it('관리자 소속은 배정 대상이 아니라 400', async () => {
    requestBody = {
      rules: [{ group: '관리자', regions: ['서울'], ageBrackets: ['under70'] }],
    };
    expect((await PUT(putReq())).status).toBe(400);
  });

  it('없는 지역이면 400', async () => {
    requestBody = {
      rules: [{ group: '경기', regions: ['화성시'], ageBrackets: ['under70'] }],
    };
    expect((await PUT(putReq())).status).toBe(400);
  });

  it('없는 나이 구간이면 400', async () => {
    requestBody = {
      rules: [{ group: '경기', regions: ['서울'], ageBrackets: ['60to70'] }],
    };
    expect((await PUT(putReq())).status).toBe(400);
  });

  it('rules가 없으면 400', async () => {
    requestBody = {};
    expect((await PUT(putReq())).status).toBe(400);
  });
});

describe('저장은 통째로 갈아끼운다', () => {
  it('지우고 새로 넣는다 — 체크 하나씩 보내면 화면과 DB가 갈린다', async () => {
    requestBody = {
      rules: [
        { group: '경기', regions: ['서울', '인천'], ageBrackets: ['under70'] },
        { group: '파라인슈', regions: ['제주'], ageBrackets: ['70to75', 'over75'] },
      ],
    };

    const res = await PUT(putReq());
    expect(res.status).toBe(200);

    expect(deletedTables).toContain('assignment_region_rules');
    expect(deletedTables).toContain('assignment_age_rules');

    expect(regionInserts[0]).toEqual([
      { department_group: '경기', region: '서울' },
      { department_group: '경기', region: '인천' },
      { department_group: '파라인슈', region: '제주' },
    ]);
    expect(ageInserts[0]).toEqual([
      { department_group: '경기', age_bracket: 'under70' },
      { department_group: '파라인슈', age_bracket: '70to75' },
      { department_group: '파라인슈', age_bracket: 'over75' },
    ]);
  });

  /** 분류와 배포가 같은 규칙을 봤는지 대조하는 값이다. 안 바뀌면 대조가 무의미해진다. */
  it('바뀐 시각을 남긴다', async () => {
    requestBody = { rules: [{ group: '경기', regions: ['서울'], ageBrackets: ['under70'] }] };
    await PUT(putReq());

    expect(metaUpdates).toHaveLength(1);
    expect(metaUpdates[0].updated_by).toBe('admin');
    expect(typeof metaUpdates[0].updated_at).toBe('string');
  });

  /*
   * 설정이 덜 된 소속은 막는다.
   *
   * 지역과 나이는 AND로 걸려서 한쪽이 비면 그 소속은 아무 건도 못 받는다.
   * 화면상으로는 체크가 몇 개 있어 설정된 것처럼 보이는데 배정에서는 조용히
   * 빠지므로, 그 지역 건이 전부 수동배정으로 떨어지고 나서야 알게 된다.
   *
   * 화면에서도 같은 검사를 하지만 서버에서 다시 본다 — 화면에서만 막으면
   * API로는 그대로 들어온다.
   */
  it('나이를 안 고른 소속이 있으면 막는다', async () => {
    requestBody = { rules: [{ group: '경기', regions: ['서울'], ageBrackets: [] }] };

    const res = await PUT(putReq());
    expect(res.status).toBe(400);
    // 막았으면 아무것도 지우지 않아야 한다. 지우고 실패하면 규칙이 빈 채로 남는다.
    expect(deletedTables).toHaveLength(0);
    expect(regionInserts).toHaveLength(0);
  });

  it('지역을 안 고른 소속이 있으면 막는다', async () => {
    requestBody = { rules: [{ group: '경기', regions: [], ageBrackets: ['under70'] }] };

    const res = await PUT(putReq());
    expect(res.status).toBe(400);
    expect(deletedTables).toHaveLength(0);
  });

  it('어느 소속이 왜 막혔는지 알려준다', async () => {
    requestBody = {
      rules: [
        { group: '경기', regions: ['서울'], ageBrackets: ['under70'] },
        { group: '한울부원', regions: [], ageBrackets: [] },
      ],
    };

    const res = await PUT(putReq());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain('한울부원');
    // 제대로 고른 소속까지 싸잡아 나무라면 어디를 고쳐야 할지 알 수 없다
    expect(body.error).not.toContain('경기 —');
  });
});
