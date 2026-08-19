import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

interface UploadedFile {
  id: string;
  name: string;
}

export function useUploadFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: File[]) => {
      const uploadedIds: string[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

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
          .filter((u: any) => u.role !== 'admin')
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
