/**
 * 파일 목록 캐시를 자리 안 바꾸고 고치는 규칙.
 *
 * 목록을 서버에서 다시 받으면 바뀐 상태로 정렬이 다시 된다. 사용자가 상태순으로
 * 정렬해 두고 작업 중이었다면 방금 누른 줄이 그 자리에서 사라지고 아래 줄들이
 * 한 칸씩 올라온다 — 누른 줄은 그대로인데 엉뚱한 줄이 바뀐 것처럼 보인다.
 * 그래서 목록을 다시 받는 대신 그 줄 하나만 고친다.
 */

export type MyDownloadStatus = 'available' | 'downloaded' | 'pending_request' | 'rejected';

interface FileRow {
  id: string;
  myDownloadStatus?: MyDownloadStatus;
  [key: string]: any;
}

interface FileListPage {
  data: FileRow[];
  [key: string]: any;
}

/**
 * 한 파일의 다운로드 상태만 바꾼 새 목록을 만든다.
 *
 * 순서는 건드리지 않는다. 대상이 없으면 들어온 값을 그대로 돌려준다 —
 * 다른 페이지를 보고 있을 때 헛되이 새 객체를 만들지 않기 위함이다.
 */
export function patchFileStatus<T extends FileListPage | undefined | null>(
  page: T,
  fileId: string,
  status: MyDownloadStatus
): T {
  if (!page || !Array.isArray(page.data)) return page;
  if (!page.data.some((file) => file.id === fileId)) return page;

  return {
    ...page,
    data: page.data.map((file) =>
      file.id === fileId ? { ...file, myDownloadStatus: status } : file
    ),
  } as T;
}
