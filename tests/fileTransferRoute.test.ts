import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 파일전달 화면의 미리보기·다운로드·삭제 API 권한 + 기록.
 *
 * /api/files/download·delete(원본파일 관리용)와는 별개 라우트다. 여기는
 * is_original로만 거른다 — 소속 일치나 다운로드 한도 같은 배포 이후 규칙이
 * 없고, 누가 올렸든 관리자·DB담당자 전원이 같은 대기열을 다룬다(my-uploads
 * 목록과 같은 원칙 — "관리자는 무조건 다 된다"). 다만 다운로드·삭제 기록은
 * 원본파일 관리와 같은 표(download_records, file_deletion_events/
 * deleted_files)에 남겨야 관리자가 한 화면에서 전체 이력을 본다.
 */

let currentUser: { id: number; role: string; username: string } | null = {
  id: 7,
  role: 'staff',
  username: 'staff7',
};
let csrfValid = true;
let requestBody: any = { reason: '실수로 올림' };
let fileRow: any = {
  id: 'file-1',
  name: 'test.xlsx',
  size: 1234,
  storage_path: 'admin/dy/7/2026-09-01/x.xlsx',
  mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  department_id: 1,
  is_original: true,
  original_file_id: null,
  uploaded_by: 7,
  uploaded_by_name: '홍길동',
  uploaded_at: '2026-09-01T00:00:00Z',
  file_content: [],
};

let queryEqCalls: Array<[string, unknown]> = [];
let deleteEqCalls: Array<[string, unknown]> = [];
let storageRemoveCalls: string[][] = [];
let downloadRecordInserts: any[] = [];
let deletionEventInserts: any[] = [];
let deletedFilesInserts: any[] = [];

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'download_records') {
        return {
          insert: (row: any) => {
            downloadRecordInserts.push(row);
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ count: 0 }),
            }),
          }),
        };
      }

      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { department: '파라인슈', name: '홍길동', employee_id: 'E1' } }),
            }),
          }),
        };
      }

      if (table === 'file_deletion_events') {
        return {
          insert: (row: any) => {
            deletionEventInserts.push(row);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 99 }, error: null }),
              }),
            };
          },
        };
      }

      if (table === 'deleted_files') {
        return {
          insert: (row: any) => {
            deletedFilesInserts.push(row);
            return Promise.resolve({ error: null });
          },
          upsert: (row: any) => {
            deletedFilesInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      // 'files' 테이블: 조회·삭제
      return {
        select: () => {
          const q: any = {
            eq: (col: string, val: unknown) => {
              queryEqCalls.push([col, val]);
              return q;
            },
            single: () =>
              Promise.resolve(fileRow ? { data: fileRow, error: null } : { data: null, error: { message: 'not found' } }),
          };
          return q;
        },
        delete: () => {
          const q: any = {
            eq: (col: string, val: unknown) => {
              deleteEqCalls.push([col, val]);
              return q;
            },
            then: (resolve: any) => resolve({ error: null }),
          };
          return q;
        },
      };
    },
    storage: {
      from: () => ({
        download: () =>
          Promise.resolve({ data: new Blob(['data']), error: null }),
        remove: (paths: string[]) => {
          storageRemoveCalls.push(paths);
          return Promise.resolve({ error: null });
        },
      }),
    },
  }),
}));

vi.mock('@/lib/jwt', () => ({ getUserFromRequest: () => currentUser }));
vi.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => csrfValid }));

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { GET, DELETE } = await import('@/app/api/file-transfer/[id]/route');

const req = (method: string) => new Request('http://localhost/api/file-transfer/file-1', { method }) as any;
const deleteReq = () =>
  new Request('http://localhost/api/file-transfer/file-1', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  }) as any;
const ctx = { params: Promise.resolve({ id: 'file-1' }) };

beforeEach(() => {
  currentUser = { id: 7, role: 'staff', username: 'staff7' };
  csrfValid = true;
  requestBody = { reason: '실수로 올림' };
  fileRow = {
    id: 'file-1',
    name: 'test.xlsx',
    size: 1234,
    storage_path: 'admin/dy/7/2026-09-01/x.xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    department_id: 1,
    is_original: true,
    original_file_id: null,
    uploaded_by: 7,
    uploaded_by_name: '홍길동',
    uploaded_at: '2026-09-01T00:00:00Z',
    file_content: [],
  };
  queryEqCalls = [];
  deleteEqCalls = [];
  storageRemoveCalls = [];
  downloadRecordInserts = [];
  deletionEventInserts = [];
  deletedFilesInserts = [];
});

describe('GET 미리보기·다운로드', () => {
  it('로그인 안 했으면 401', async () => {
    currentUser = null;
    expect((await GET(req('GET'), ctx)).status).toBe(401);
  });

  it('지사는 403', async () => {
    currentUser = { id: 2, role: 'user', username: 'user2' };
    expect((await GET(req('GET'), ctx)).status).toBe(403);
  });

  it('관리자는 200', async () => {
    currentUser = { id: 1, role: 'admin', username: 'admin' };
    expect((await GET(req('GET'), ctx)).status).toBe(200);
  });

  it('DB담당자는 200', async () => {
    expect((await GET(req('GET'), ctx)).status).toBe(200);
  });

  it('다른 사람이 올린 파일도 볼 수 있다 — 같은 대기열이다', async () => {
    currentUser = { id: 99, role: 'staff', username: 'staff99' };
    expect((await GET(req('GET'), ctx)).status).toBe(200);
  });

  it('is_original로 거르고, 올린 사람으로는 거르지 않는다', async () => {
    await GET(req('GET'), ctx);
    expect(queryEqCalls).toContainEqual(['is_original', true]);
    expect(queryEqCalls.some(([col]) => col === 'uploaded_by')).toBe(false);
  });

  it('원본이 아니거나 없는 파일이면 404', async () => {
    fileRow = null;
    expect((await GET(req('GET'), ctx)).status).toBe(404);
  });

  it('다운로드 로그(download_records)에 한 줄 남긴다', async () => {
    await GET(req('GET'), ctx);
    expect(downloadRecordInserts).toHaveLength(1);
    expect(downloadRecordInserts[0]).toMatchObject({
      file_id: 'file-1',
      user_id: 7,
      downloaded_by: 'staff7',
      file_name: 'test.xlsx',
    });
  });
});

describe('DELETE 삭제', () => {
  it('로그인 안 했으면 401', async () => {
    currentUser = null;
    expect((await DELETE(deleteReq(), ctx)).status).toBe(401);
  });

  it('지사는 403', async () => {
    currentUser = { id: 2, role: 'user', username: 'user2' };
    expect((await DELETE(deleteReq(), ctx)).status).toBe(403);
  });

  it('CSRF 토큰이 없으면 403', async () => {
    csrfValid = false;
    expect((await DELETE(deleteReq(), ctx)).status).toBe(403);
  });

  it('삭제 사유가 없으면 400', async () => {
    requestBody = { reason: '  ' };
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(400);
    expect(deletionEventInserts).toHaveLength(0);
  });

  it('삭제 사유가 500자를 넘으면 400', async () => {
    requestBody = { reason: 'a'.repeat(501) };
    expect((await DELETE(deleteReq(), ctx)).status).toBe(400);
  });

  it('대기열에 있는 파일이면 200이고, storage는 남기고 DB만 지운다', async () => {
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(200);
    // 복구 가능해야 하므로 storage 실체는 지우지 않는다.
    expect(storageRemoveCalls).toHaveLength(0);
    expect(deleteEqCalls).toContainEqual(['is_original', true]);
    expect(deleteEqCalls.some(([col]) => col === 'uploaded_by')).toBe(false);
  });

  it('삭제 히스토리(file_deletion_events, deleted_files)에 기록한다', async () => {
    await DELETE(deleteReq(), ctx);
    expect(deletionEventInserts).toEqual([
      { deleted_by: 'staff7', total_count: 1, reason: '실수로 올림' },
    ]);
    expect(deletedFilesInserts).toHaveLength(1);
    expect(deletedFilesInserts[0]).toMatchObject({
      id: 'file-1',
      name: 'test.xlsx',
      storage_path: 'admin/dy/7/2026-09-01/x.xlsx',
      deletion_event_id: 99,
    });
  });

  it('다른 사람이 올린 파일도 지울 수 있다 — 같은 대기열이다', async () => {
    currentUser = { id: 99, role: 'staff', username: 'staff99' };
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(200);
  });

  it('원본이 아니거나 없는 파일이면 404이고 아무것도 기록하지 않는다', async () => {
    fileRow = null;
    const res = await DELETE(deleteReq(), ctx);
    expect(res.status).toBe(404);
    expect(deletionEventInserts).toHaveLength(0);
  });
});
