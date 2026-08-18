import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

// 히스토리 접근 권한이 살아있는지 확인한다.
export function useHistoryAccess() {
  return useQuery({
    queryKey: ['historyAccess'],
    queryFn: async () => {
      const response = await fetch('/api/files/history/verify', {
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });

      if (!response.ok) return { hasAccess: false };

      return response.json() as Promise<{ hasAccess: boolean }>;
    },
    // 티켓 만료를 늦게 알아채지 않도록 캐시를 짧게 잡는다.
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useVerifyHistoryPassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (password: string) => {
      const response = await fetch('/api/files/history/verify', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || '확인에 실패했습니다.');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historyAccess'] });
      queryClient.invalidateQueries({ queryKey: ['deletionHistory'] });
    },
  });
}
