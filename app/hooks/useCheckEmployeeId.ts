import { useQuery } from '@tanstack/react-query';

interface CheckEmployeeIdResponse {
  available: boolean;
  employee_id: string;
}

export function useCheckEmployeeId(employeeId: string | null, excludeUserId?: number, enabled: boolean = true) {
  return useQuery({
    queryKey: ['checkEmployeeId', employeeId, excludeUserId],
    queryFn: async () => {
      if (!employeeId) return null;

      const params = new URLSearchParams({
        employee_id: employeeId,
      });
      if (excludeUserId) {
        params.append('exclude_user_id', excludeUserId.toString());
      }

      const response = await fetch(`/api/users/check-employee-id?${params}`);
      if (!response.ok) throw new Error('Failed to check employee ID');
      return response.json() as Promise<CheckEmployeeIdResponse>;
    },
    enabled: enabled && !!employeeId && employeeId.length > 0,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
    retry: 1,
  });
}
