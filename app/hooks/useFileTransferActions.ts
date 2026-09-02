import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

/**
 * 파일전달 목록의 미리보기·다운로드·삭제. /api/file-transfer/[id]를 쓴다 —
 * '원본파일 관리'의 /api/files/download·delete와는 다른 화면, 다른 규칙이다.
 */

export function usePreviewMyUpload() {
  return useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      const response = await fetch(`/api/file-transfer/${fileId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('파일을 열 수 없습니다.');
      }

      const blob = await response.blob();
      return new File([blob], fileName, { type: blob.type });
    },
  });
}

export function useDownloadMyUpload() {
  return useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      // intent=download가 있어야 다운로드 로그에 남는다. 미리보기·파일업로드의
      // "가져오기"는 같은 라우트를 쓰지만 이 표시가 없어 로그에 안 남는다.
      const response = await fetch(`/api/file-transfer/${fileId}?intent=download`, {
        credentials: 'include',
      });

      if (!response.ok) {
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
  });
}

export function useDeleteMyUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fileId, reason }: { fileId: string; reason: string }) => {
      const response = await fetch(`/api/file-transfer/${fileId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || '파일 삭제에 실패했습니다.');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myUploads'], exact: false });
      // 삭제 히스토리에 방금 지운 이벤트가 한 줄 늘어난다.
      queryClient.invalidateQueries({ queryKey: ['deletionHistory'], exact: false });
    },
  });
}
