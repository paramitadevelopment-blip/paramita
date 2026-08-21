import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

// 사이드바 배지용 대기 건수. 목록 API를 1건만 받아서 총 건수만 쓴다.
// 다른 관리자가 처리하거나 사용자가 새로 요청하면 이 창의 캐시로는 알 수 없으므로
// refetchInterval로 주기적으로만 맞춘다.
export function usePendingRequestCount(enabled: boolean) {
  return useQuery({
    queryKey: ['downloadApproval', 'pendingCount'],
    queryFn: async () => {
      const response = await fetch('/api/download-requests?status=pending&page=1&limit=1', {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) {
        throw new Error('대기 건수를 불러올 수 없습니다.');
      }

      const result = await response.json();
      return (result?.pagination?.total as number) || 0;
    },
    enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
