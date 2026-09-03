import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { isProtectedAccount } from '@/lib/roles';
import { invalidateDashboard } from './useDashboardCache';

interface UploadedFile {
  id: string;
  name: string;
}

/**
 * 원본을 어느 화면에서 올리는가. 파일전달로 들어온 것과 관리자가 파일업로드에서
 * 직접 올린 것은 보는 화면이 갈리므로 서버에 함께 알려준다.
 * 서버도 다시 판단한다 — DB담당자는 무엇을 보내든 file_transfer로 굳힌다.
 */
type UploadSource = 'direct' | 'file_transfer';

export function useUploadFiles(source: UploadSource = 'direct') {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: File[]) => {
      const uploadedIds: string[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('source', source);

        const response = await fetch('/api/files/upload', {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-Token': getCsrfToken() },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '파일 업로드에 실패했습니다.');
        }

        const uploadedData = await response.json();
        uploadedIds.push(uploadedData.fileId);
      }

      return uploadedIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      invalidateDashboard(queryClient);
      // 관리자에게는 해당 없는 쿼리라 그냥 무시된다. DB담당자가 방금 전달한
      // 파일이 파일전달 화면 목록에 새로고침 없이 바로 보이게 한다.
      queryClient.invalidateQueries({ queryKey: ['myUploads'] });
    },
  });
}

export function useDeployFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      files: string[];
      classificationResults: Record<number, number>;
      /** 파일 순서와 1:1로 맞춘 행별 부서 선택 (주문번호: 부서명) */
      rowAssignments: Array<Record<string, string>>;
      /** 상담메모 규칙. 분류할 때 켰으면 배포도 같은 값이어야 결과가 안 갈린다 */
      memoRule: boolean;
      /** 분류가 본 배정 규칙의 시각. 그사이 설정이 바뀌었으면 서버가 배포를 막는다 */
      rulesUpdatedAt: string | null;
    }) => {
      const response = await fetch('/api/files/deploy', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '배포에 실패했습니다.');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      invalidateDashboard(queryClient);

      /*
       * 배포는 파일만 만드는 게 아니다. 배정에서 빠진 건이 재신청 알림으로 쌓이고,
       * 60일 3회에 걸린 사람이 명단에 오르며, 이미 명단에 있던 사람은 신청횟수가
       * 늘어난다. 이걸 안 지우면 방금 배포했는데 화면 숫자가 그대로라 사람이
       * "안 들어갔나" 하고 또 배포하게 된다.
       */
      queryClient.invalidateQueries({ queryKey: ['reapplyNotices'] });
      queryClient.invalidateQueries({ queryKey: ['blacklist'] });
    },
  });
}

export function useAllUsers() {
  return useMutation({
    mutationFn: async () => {
      const allUserIds: number[] = [];
      let pageNum = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(`/api/users?limit=100&page=${pageNum}`, {
          credentials: 'include',
          headers: {
            'X-CSRF-Token': getCsrfToken(),
          },
        });
        const result = await response.json();
        const users = result.data || [];

        if (users.length === 0) {
          hasMore = false;
          break;
        }

        const nonAdminIds = users
          .filter((u: any) => !isProtectedAccount(u.role))
          .map((u: any) => u.id);

        allUserIds.push(...nonAdminIds);

        if (users.length < 100) {
          hasMore = false;
        } else {
          pageNum++;
        }
      }

      return allUserIds;
    },
  });
}

export function useAllFiles(showOriginal: boolean = false) {
  return useMutation({
    mutationFn: async () => {
      const allFileIds: string[] = [];
      let currentPage = 1;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: '100',
          sortBy: 'uploaded_at',
          sortOrder: 'desc',
          showOriginal: showOriginal.toString(),
        });

        const response = await fetch(`/api/files/list?${params}`, {
          credentials: 'include',
          headers: {
            'X-CSRF-Token': getCsrfToken(),
          },
        });

        if (!response.ok) break;

        const result = await response.json();
        const fileList = result.data || [];

        if (fileList.length === 0) {
          hasMore = false;
          break;
        }

        allFileIds.push(...fileList.map((f: UploadedFile) => f.id));

        if (fileList.length < 100) {
          hasMore = false;
        } else {
          currentPage++;
        }
      }

      return allFileIds;
    },
  });
}
