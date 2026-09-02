import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { invalidateDashboard } from './useDashboardCache';

export interface DeletedFile {
  id: string;
  name: string;
  size: number;
  department_id: number | null;
  is_original: boolean;
  original_file_id: string | null;
  restored_at: string | null;
  source: string;
}

export interface DeletionEvent {
  id: number;
  deleted_at: string;
  /** 삭제한 사람의 로그인 아이디 */
  deleted_by: string;
  /** 삭제한 사람의 실명. 조회할 때 users에서 찾아 붙인다 — 계정이 지워졌으면 null */
  deleted_by_name: string | null;
  total_count: number;
  reason: string;
  restored_at: string | null;
  restored_by: string | null;
  files: DeletedFile[];
}

export interface DeletionHistoryResponse {
  events: DeletionEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function useDeletionHistory(page: number = 1, limit: number = 10, search: string = '') {
  return useQuery({
    queryKey: ['deletionHistory', page, limit, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (search.trim()) {
        params.append('search', search);
      }

      const response = await fetch(`/api/files/history?${params}`, {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) throw new Error('히스토리 조회 실패');
      return response.json() as Promise<DeletionHistoryResponse>;
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

// 삭제된 파일 미리보기. files 테이블에 없으므로 전용 엔드포인트를 쓴다.
export function usePreviewDeletedFile() {
  return useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      const response = await fetch(`/api/files/history/preview/${fileId}`, {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || '파일을 읽을 수 없습니다.');
      }

      const blob = await response.blob();
      return new File([blob], fileName, { type: blob.type });
    },
  });
}

export function useRestoreFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { eventId: number; fileIds?: string[] }) => {
      const response = await fetch('/api/files/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify(params),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '파일 복구에 실패했습니다.');
      }

      return response.json();
    },
    onSuccess: () => {
      // 히스토리와 파일 목록 모두 새로고침
      queryClient.invalidateQueries({ queryKey: ['deletionHistory'] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      invalidateDashboard(queryClient);
    },
  });
}
