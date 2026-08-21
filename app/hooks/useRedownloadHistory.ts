import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

export interface RedownloadHistoryRecord {
  id: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reason: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  reviewed_by_name: string | null;
}

/**
 * 한 파일에 대한 재다운로드 요청 이력.
 * userId는 관리자만 의미가 있고, 비관리자가 보내면 서버가 무시하고 본인 것만 준다.
 */
export function useRedownloadHistory(
  fileId: string | null,
  userId?: number | null,
  /** 계정이 지워진 사람의 이력을 볼 때 쓴다. user_id가 비어 id로는 못 찾는다. */
  username?: string | null
) {
  return useQuery({
    queryKey: ['redownloadHistory', fileId, userId ?? null, username ?? null],
    queryFn: async () => {
      const params = new URLSearchParams({ fileId: fileId! });
      if (userId) params.append('userId', String(userId));
      else if (username) params.append('username', username);

      const response = await fetch(`/api/download-requests/history?${params}`, {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) {
        throw new Error('요청 이력을 불러올 수 없습니다.');
      }

      const result = await response.json();
      return (result?.records || []) as RedownloadHistoryRecord[];
    },
    enabled: !!fileId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
