import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

export function useRedownloadRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fileId, reason }: { fileId: string; reason?: string }) => {
      const response = await fetch('/api/download-requests', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ fileId, reason }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || '재다운로드 요청에 실패했습니다.');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['redownloadHistory'] });
    },
  });
}
