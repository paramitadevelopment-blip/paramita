import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 파일전달 목록 API 권한.
 *
 * 관리자·DB담당자만 볼 수 있어야 한다. 목록 자체는 누가 올렸든 같은
 * 대기열이라 uploaded_by로 거르지 않는다 — "관리자는 무조건 다 된다"는
 * 원칙대로 관리자와 DB담당자가 서로 다른 목록을 보면 안 된다.
 */

let currentUser: { id: number; role: string } | null = { id: 7, role: 'staff' };
let eqCalls: Array<[string, unknown]> = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => {
        const result = { data: [], error: null, count: 0 };
        const q: any = {
          eq: (col: string, val: unknown) => {
            eqCalls.push([col, val]);
            return q;
          },
          order: () => q,
          range: () => Promise.resolve(result),
        };
        return q;
      },
    }),
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
