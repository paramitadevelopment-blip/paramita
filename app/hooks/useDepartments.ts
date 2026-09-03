import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { ASSIGNMENT_RULES_KEY } from '@/app/hooks/useAssignmentRules';
import { invalidateDashboard } from './useDashboardCache';

interface Department {
  id: number;
  name: string;
  /** 이 분류가 속한 조직. 1:1인 소속은 name과 같다. */
  group_name: string;
  /** 업로드한 원본이 들어가는 자리. 사람이 배정받거나 파일이 배포되는 소속이 아니다. */
  is_admin: boolean;
  created_at: string;
}

/**
 * 소속 목록은 관리자 화면에서만 쓴다.
 * 일반 사용자도 들어오는 화면에서는 enabled로 꺼서 불필요한 조회를 막는다.
 */
export function useDepartments(enabled = true) {
  return useQuery({
    queryKey: ['departments'],
    enabled,
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
      invalidateDashboard(queryClient);
      // 지역설정 표의 열은 소속 목록에서 만들어진다. 안 비우면 방금 만든
      // 소속이 새로고침 전까지 안 보인다 (staleTime이 5분이라 그동안 안 받아온다).
      queryClient.invalidateQueries({ queryKey: ASSIGNMENT_RULES_KEY });
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
      invalidateDashboard(queryClient);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // 소속이 바뀌면 파일의 소속과 사용자별 소속 이력도 함께 바뀐다.
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['departmentLogs'] });
      // 지운 소속이 지역설정 표에 열로 남아 있으면, 없는 소속에 체크해 두고
      // 저장하다 거부당한다 (규칙 저장 API가 실재하는 소속만 받는다).
      queryClient.invalidateQueries({ queryKey: ASSIGNMENT_RULES_KEY });
    },
  });
}
