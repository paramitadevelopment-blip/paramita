import { useQuery } from '@tanstack/react-query';

export interface DashboardSummary {
  totalUsers: number;
  totalDepartments: number;
  todayUsers: number;
  uploadedFiles: number;
}

export interface RecentUser {
  id: number;
  username: string;
  name: string;
  employee_id?: string;
  department: string;
  created_at: string;
}

export interface DepartmentStat {
  id: number;
  name: string;
  userCount: number;
  fileCount: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  recentUsers: RecentUser[];
  recentFiles: [];
  departmentStats: DepartmentStat[];
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      return response.json() as Promise<DashboardData>;
    },
    // 요약 숫자는 옛것이 보이는 걸 허용하지 않는다. 화면에 들어오거나 창으로
    // 돌아올 때마다 다시 센다. 내가 한 변경은 invalidateDashboard(useDashboardCache)가
    // 즉시 반영하고, 이 설정이 다른 관리자가 바꾼 것까지 늦지 않게 받아준다.
    // 캐시는 남겨 둬서(gcTime) 들어오는 순간엔 이전 값을 보여주고 뒤에서 갱신한다.
    staleTime: 0,
    gcTime: 1000 * 60 * 10,
  });
}
