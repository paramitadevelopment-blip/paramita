import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

interface Department {
  id: number;
  name: string;
  created_at: string;
}

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const response = await fetch('/api/departments', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch departments');
      const data = await response.json();
      return data.data as Department[];
    },
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}

export function useCreateDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const csrfToken = getCsrfToken();
      const response = await fetch('/api/departments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ name }),
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create department');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
  });
}

export function useDeleteDepartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: number; checkOnly?: boolean; newDepartmentName?: string }) => {
      const csrfToken = getCsrfToken();
      let url = `/api/departments?id=${params.id}`;
      if (params.checkOnly) {
        url += '&checkOnly=true';
      }
      if (params.newDepartmentName) {
        url += `&newDepartmentName=${encodeURIComponent(params.newDepartmentName)}`;
      }
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete department');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // 소속이 바뀌면 파일의 소속과 사용자별 소속 이력도 함께 바뀐다.
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['departmentLogs'] });
    },
  });
}
