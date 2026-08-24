import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { patchFileStatus, type MyDownloadStatus } from '@/lib/fileListCache';

export function useDownloadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      const response = await fetch(`/api/files/download/${fileId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        // 403: 한도 소진, 409: 같은 파일을 동시에 받으려 해서 한쪽이 밀린 경우
        if (response.status === 403 || response.status === 409) {
          const errorData = await response.json().catch(() => ({}));
          const error: any = new Error(errorData?.error || '파일 다운로드에 실패했습니다.');
          error.code = errorData?.code;
          throw error;
        }
        throw new Error('파일 다운로드에 실패했습니다.');
      }

      // 받고 난 뒤의 버튼 상태를 서버가 알려준다 (관리자는 제한이 없어 보내지 않는다).
      const statusAfter = response.headers.get('X-My-Download-Status');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      return { fileId, statusAfter };
    },
    onSuccess: ({ fileId, statusAfter }) => {
      // 목록을 통째로 다시 받지 않고 방금 받은 줄만 고친다.
      //
      // 다시 받으면 서버가 새 상태로 정렬을 다시 한다. 사용자가 상태순으로
      // 정렬해 두고 작업 중이었다면, 방금 누른 줄이 그 자리에서 사라지고
      // 아래 줄들이 한 칸씩 올라온다. 누른 줄은 안 바뀌고 엉뚱한 줄이
      // 바뀐 것처럼 보인다. 정렬은 사용자가 정렬을 다시 걸거나 페이지를
      // 옮길 때 반영되면 충분하다.
      if (statusAfter) {
        queryClient.setQueriesData({ queryKey: ['files'], exact: false }, (old: any) =>
          patchFileStatus(old, fileId, statusAfter as MyDownloadStatus)
        );
      }

      // 방금 받은 기록이 파일별 다운로드 로그에도 한 줄 늘어난다.
      queryClient.invalidateQueries({ queryKey: ['downloadLogs'], exact: false });
    },
  });
}

export function usePreviewFile() {
  return useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      const response = await fetch(`/api/files/download/${fileId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('파일을 읽을 수 없습니다.');
      }

      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type });
      return file;
    },
  });
}

export function useDeleteFiles() {
  return useMutation({
    mutationFn: async (data: { fileIds: string[]; deleteDistributedFiles?: boolean; reason: string }) => {
      const response = await fetch('/api/files/delete', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({
          fileIds: data.fileIds,
          deleteDistributedFiles: data.deleteDistributedFiles !== false,
          reason: data.reason,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || '파일 삭제에 실패했습니다.');
      }

      return response.json();
    },
  });
}
