import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

export function useRedownloadReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      action,
      reason,
    }: {
      requestId: number;
      action: 'approve' | 'reject';
      reason?: string;
    }) => {
      const response = await fetch('/api/download-requests/review', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ requestId, action, reason }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || '처리에 실패했습니다.');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['downloadApproval'] });
      queryClient.invalidateQueries({ queryKey: ['redownloadHistory'] });
    },
  });
}
