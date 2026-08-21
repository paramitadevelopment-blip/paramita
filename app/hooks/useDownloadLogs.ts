import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

interface DownloadLog {
  id: number;
  downloaded_by: string;
  user_name: string | null;
  user_employee_id: string | null;
  user_department: string | null;
  downloaded_at: string;
}

export function useDownloadLogs(fileId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['downloadLogs', fileId],
    queryFn: async () => {
      if (!fileId) throw new Error('fileId is required');

      const params = new URLSearchParams({ fileId, limit: '100' });
      const response = await fetch(`/api/download-history?${params}`, {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) throw new Error('로그 조회 실패');
      const data = await response.json();
      return (data.records || []) as DownloadLog[];
    },
    enabled: !!fileId && enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
