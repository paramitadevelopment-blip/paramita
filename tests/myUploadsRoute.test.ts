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

describe('이미 배포된 원본은 큐에서 뺀다', () => {
  it('자식이 생긴 원본 id는 not-in으로 제외한다', async () => {
    deployedRows = [{ original_file_id: 'orig-1' }, { original_file_id: 'orig-2' }];

    await GET(req());

    expect(notCalls).toContainEqual(['id', 'in', '(orig-1,orig-2)']);
  });

  it('중복된 자식(같은 원본이 여러 부서로 배포됨)은 한 번만 넣는다', async () => {
    deployedRows = [
      { original_file_id: 'orig-1' },
      { original_file_id: 'orig-1' },
      { original_file_id: 'orig-1' },
    ];

    await GET(req());

    expect(notCalls).toContainEqual(['id', 'in', '(orig-1)']);
  });

  it('배포된 게 하나도 없으면 not-in 자체를 걸지 않는다', async () => {
    deployedRows = [];

    await GET(req());

    expect(notCalls.some(([col, op]) => col === 'id' && op === 'in')).toBe(false);
  });
});
