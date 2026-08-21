import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

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

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      // 받고 나면 다운로드 한도가 줄어 버튼 상태(다운로드 → 재다운로드 요청)가 바뀐다.
      // 목록을 다시 받지 않으면 화면은 계속 '다운로드'로 남는다.
      queryClient.invalidateQueries({ queryKey: ['files'], exact: false });
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
