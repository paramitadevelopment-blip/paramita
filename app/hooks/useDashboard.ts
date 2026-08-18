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
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
}
