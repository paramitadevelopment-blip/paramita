import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 소속 API 권한.
 *
 * 조회(GET)는 사용자 관리뿐 아니라 파일 업로드(분류·배포)·소속 필터 등
 * 관리자급 화면 전반에서 쓰므로 서브관리자도 볼 수 있어야 한다. 생성·삭제는
 * 소속 관리 자체(사용자 관리 화면 소속)라 admin 전용으로 남긴다.
 */

let currentUser: { id: number; role: string; username: string } | null = {
  id: 1,
  role: 'admin',
  username: 'admin',
};
let csrfValid = true;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
      insert: () => ({
        select: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    rpc: () => Promise.resolve({ data: {}, error: null }),
  }),
}));

vi.mock('@/lib/jwt', () => ({ getUserFromRequest: () => currentUser }));
vi.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => csrfValid }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { GET, POST, DELETE } = await import('@/app/api/departments/route');

const getReq = () => new Request('http://localhost/api/departments') as any;
const postReq = () =>
  new Request('http://localhost/api/departments', {
    method: 'POST',
    body: JSON.stringify({ name: '테스트소속' }),
  }) as any;
const deleteReq = () => new Request('http://localhost/api/departments?id=1', { method: 'DELETE' }) as any;

beforeEach(() => {
  currentUser = { id: 1, role: 'admin', username: 'admin' };
  csrfValid = true;
});

describe('GET — 조회는 관리자·서브관리자 둘 다 된다', () => {
  it('관리자는 200', async () => {
    expect((await GET(getReq())).status).toBe(200);
  });

  it('서브관리자는 200', async () => {
    currentUser = { id: 2, role: 'subadmin', username: 'sub1' };
    expect((await GET(getReq())).status).toBe(200);
  });

  it('지사는 403', async () => {
    currentUser = { id: 3, role: 'user', username: 'branch1' };
    expect((await GET(getReq())).status).toBe(403);
  });

  it('DB담당자는 403', async () => {
    currentUser = { id: 4, role: 'staff', username: 'staff1' };
    expect((await GET(getReq())).status).toBe(403);
  });
});

describe('POST — 생성은 관리자만 된다', () => {
  it('관리자는 201', async () => {
    expect((await POST(postReq())).status).toBe(201);
  });

  /** 소속 관리는 사용자 관리 화면 소속이라 서브관리자는 조회만 되고 생성은 안 된다. */
  it('서브관리자는 403', async () => {
    currentUser = { id: 2, role: 'subadmin', username: 'sub1' };
    expect((await POST(postReq())).status).toBe(403);
  });
});

describe('DELETE — 삭제도 관리자만 된다', () => {
  it('서브관리자는 403', async () => {
    currentUser = { id: 2, role: 'subadmin', username: 'sub1' };
    csrfValid = true;
    expect((await DELETE(deleteReq())).status).toBe(403);
  });
});
