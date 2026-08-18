import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

export interface DepartmentChangeLog {
  id: number;
  from_department: string | null;
  to_department: string | null;
  reason: 'department_deleted' | 'manual_edit';
  changed_by: string | null;
  changed_at: string;
}

export function useDepartmentLogs(userId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['departmentLogs', userId],
    queryFn: async () => {
      const params = new URLSearchParams({ userId: String(userId) });
      const response = await fetch(`/api/users/department-logs?${params}`, {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) throw new Error('소속 변경 이력을 불러올 수 없습니다.');

      const data = await response.json();
      return (data.records || []) as DepartmentChangeLog[];
    },
    enabled: !!userId && enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
