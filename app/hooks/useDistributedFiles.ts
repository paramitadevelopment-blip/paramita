import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';

export interface DistributedFile {
  id: string;
  name: string;
  originalFileId: string;
  department: string;
}

// 원본 파일에 연결된 배포 파일 목록. 삭제 모달에서 사용한다.
export function useDistributedFiles(originalFileIds: string[]) {
  // 순서가 달라도 같은 요청으로 취급되도록 키를 정규화한다.
  const ids = [...originalFileIds].sort();

  return useQuery({
    queryKey: ['distributedFiles', ids],
    queryFn: async () => {
      const params = new URLSearchParams({ originalFileIds: ids.join(',') });

      const response = await fetch(`/api/files/distributed?${params}`, {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (!response.ok) {
        throw new Error('배포 파일을 불러올 수 없습니다.');
      }

      const result = await response.json();
      return (result.data || []) as DistributedFile[];
    },
    enabled: ids.length > 0,
    // 삭제 모달을 여는 짧은 시점에만 쓰이므로 신선도를 짧게 잡는다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
