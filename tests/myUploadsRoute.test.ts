import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 파일전달 목록 API 권한 + 범위.
 *
 * 관리자·DB담당자만 볼 수 있어야 한다. 목록 자체는 누가 올렸든 같은
 * 대기열이라 uploaded_by로 거르지 않는다 — "관리자는 무조건 다 된다"는
 * 원칙대로 관리자와 DB담당자가 서로 다른 목록을 보면 안 된다.
 *
 * 이미 배포된 원본(자식 파일이 생긴 원본)은 큐에서 뺀다. 관리자가 PC에서
 * 직접 올려 바로 배포한 파일도 내부적으로는 같은 is_original 행을 거치므로,
 * 이 필터가 없으면 이미 끝난 파일이 "아직 분류 안 된 대기열"에 섞여 보인다.
 */

let currentUser: { id: number; role: string } | null = { id: 7, role: 'staff' };
let eqCalls: Array<[string, unknown]> = [];
let notCalls: Array<[string, string, unknown]> = [];
let deployedRows: Array<{ original_file_id: string | null }> = [];
let mainFilesRows: any[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        return { select: () => ({ in: () => Promise.resolve({ data: [] }) }) };
      }

      return {
        select: (cols: string) => {
          const isDeployedQuery = cols === 'original_file_id';
          const q: any = {
            eq: (col: string, val: unknown) => {
              eqCalls.push([col, val]);
              return q;
            },
            not: (col: string, op: string, val: unknown) => {
              notCalls.push([col, op, val]);
              return q;
            },
            order: () => q,
            // fetchAllRows가 buildQuery().range(from, to)로 부른다. 이 큐는
            // 한 번에 mainFilesRows 전체를 count와 같이 돌려주므로 한 번만 돈다.
            range: () =>
              Promise.resolve({ data: mainFilesRows, error: null, count: mainFilesRows.length }),
            // eq/not만 거치고 바로 await하는 자리(deployedRows 조회)를 위해 thenable로도 동작한다.
            then: (resolve: any) => resolve({ data: isDeployedQuery ? deployedRows : mainFilesRows, error: null }),
          };
          return q;
        },
      };
    },
  }),
}));

vi.mock('@/lib/jwt', () => ({ getUserFromRequest: () => currentUser }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { GET } = await import('@/app/api/files/my-uploads/route');

const req = () => new Request('http://localhost/api/files/my-uploads') as any;

beforeEach(() => {
  currentUser = { id: 7, role: 'staff' };
  eqCalls = [];
  notCalls = [];
  deployedRows = [];
  mainFilesRows = [];
});

describe('관리자와 DB담당자만 볼 수 있다', () => {
  it('로그인 안 했으면 401', async () => {
    currentUser = null;
    expect((await GET(req())).status).toBe(401);
  });

  /** 관리자는 어느 화면이든 막히지 않는다 — DB담당자가 하는 걸 관리자도 할 수 있어야 한다. */
  it('관리자는 200', async () => {
    currentUser = { id: 1, role: 'admin' };
    expect((await GET(req())).status).toBe(200);
  });

  it('지사는 403', async () => {
    currentUser = { id: 2, role: 'user' };
    expect((await GET(req())).status).toBe(403);
  });

  it('DB담당자는 200', async () => {
    expect((await GET(req())).status).toBe(200);
  });
});

describe('전체 대기열을 조회한다 — 올린 사람으로 거르지 않는다', () => {
  it('is_original로만 거른다', async () => {
    await GET(req());

    expect(eqCalls).toContainEqual(['is_original', true]);
    expect(eqCalls.some(([col]) => col === 'uploaded_by')).toBe(false);
  });

  /** 관리자도 예외가 아니다 — 관리자가 조회해도 같은 필터, 같은 목록이다. */
  it('관리자가 조회해도 uploaded_by로 거르지 않는다', async () => {
    currentUser = { id: 1, role: 'admin' };
    await GET(req());

    expect(eqCalls.some(([col]) => col === 'uploaded_by')).toBe(false);
  });
});

describe('파일전달로 들어온 원본만 본다', () => {
  /**
   * 관리자가 파일업로드에서 직접 올린 원본은 원본파일 관리 쪽 것이다. 출처로
   * 가르지 않으면 두 화면이 같은 행을 보게 되어, 한쪽에 올리면 다른 쪽에도 뜨고
   * 한쪽에서 지우면 양쪽에서 사라진다.
   */
  it("source가 'file_transfer'인 것만 거른다", async () => {
    await GET(req());

    expect(eqCalls).toContainEqual(['is_original', true]);
    expect(eqCalls).toContainEqual(['source', 'file_transfer']);
  });

  it('관리자가 조회해도 같은 필터를 쓴다', async () => {
    currentUser = { id: 1, role: 'admin' };
    await GET(req());

    expect(eqCalls).toContainEqual(['source', 'file_transfer']);
  });
});

describe('검색어로 파일명·올린 사람·엑셀 내용을 거른다', () => {
  beforeEach(() => {
    mainFilesRows = [
      {
        id: 'f1',
        name: '20260815_흥국화재.xlsx',
        size: 100,
        uploaded_at: '2026-08-15T00:00:00Z',
        uploaded_by: 7,
        uploaded_by_name: '김디비',
        file_content: [{ 고객명: '홍길동', Tel1: '01011112222', 상품명: '무배당상품' }],
      },
      {
        id: 'f2',
        name: '20260816_동양생명.xlsx',
        size: 200,
        uploaded_at: '2026-08-16T00:00:00Z',
        uploaded_by: 8,
        uploaded_by_name: '박관리',
        file_content: [{ 고객명: '이순신', Tel1: '01033334444', 상품명: '건강보험' }],
      },
    ];
  });

  it('검색어가 없으면 전체를 돌려준다', async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(body.data).toHaveLength(2);
  });

  it('파일명에 검색어가 있으면 걸린다', async () => {
    const res = await GET(new Request('http://localhost/api/files/my-uploads?search=흥국화재') as any);
    const body = await res.json();

    expect(body.data.map((f: any) => f.id)).toEqual(['f1']);
  });

  it('올린 사람 이름에 검색어가 있으면 걸린다', async () => {
    const res = await GET(new Request('http://localhost/api/files/my-uploads?search=박관리') as any);
    const body = await res.json();

    expect(body.data.map((f: any) => f.id)).toEqual(['f2']);
  });

  /**
   * 파일전달 대기열은 아직 분류 전이라 파일명만으로는 어떤 신청 건이
   * 들어 있는지 알 수 없다. 고객명·전화번호·상품명처럼 엑셀 내용까지
   * 뒤질 수 있어야 특정 고객 건을 찾을 수 있다.
   */
  it('엑셀 내용(고객명)에 검색어가 있으면 걸린다', async () => {
    const res = await GET(new Request('http://localhost/api/files/my-uploads?search=홍길동') as any);
    const body = await res.json();

    expect(body.data.map((f: any) => f.id)).toEqual(['f1']);
  });

  it('엑셀 내용(전화번호)에 검색어가 있으면 걸린다', async () => {
    const res = await GET(new Request('http://localhost/api/files/my-uploads?search=01033334444') as any);
    const body = await res.json();

    expect(body.data.map((f: any) => f.id)).toEqual(['f2']);
  });

  it('엑셀 내용(상품명)에 검색어가 있으면 걸린다', async () => {
    const res = await GET(new Request('http://localhost/api/files/my-uploads?search=건강보험') as any);
    const body = await res.json();

    expect(body.data.map((f: any) => f.id)).toEqual(['f2']);
  });

  it('응답에는 file_content를 실어 보내지 않는다', async () => {
    const res = await GET(new Request('http://localhost/api/files/my-uploads?search=홍길동') as any);
    const body = await res.json();

    expect(body.data[0].file_content).toBeUndefined();
  });

  it('어디에도 없는 검색어면 빈 목록', async () => {
    const res = await GET(new Request('http://localhost/api/files/my-uploads?search=존재하지않음') as any);
    const body = await res.json();

    expect(body.data).toHaveLength(0);
  });
});
