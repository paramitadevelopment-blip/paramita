import { useQuery } from '@tanstack/react-query';

/**
 * 파일전달 대기열(아직 분류 전인 원본) 목록. 관리자·DB담당자 전원이 같은
 * 목록을 본다 — 누가 올렸는지는 uploaded_by_name으로 표시만 한다.
 */
export interface MyUpload {
  id: string;
  name: string;
  size: number;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

interface MyUploadsResponse {
  data: MyUpload[];
  pagination: { page: number; limit: number; totalRecords: number; totalPages: number };
}

export function useMyUploads(
  page: number,
  limit: number,
  sortBy: string = 'uploaded_at',
  sortOrder: 'asc' | 'desc' = 'desc',
  search: string = ''
) {
  return useQuery({
    queryKey: ['myUploads', page, limit, sortBy, sortOrder, search],
    queryFn: async (): Promise<MyUploadsResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        sortOrder,
        search,
      });
      const response = await fetch(`/api/files/my-uploads?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('업로드 목록을 불러올 수 없습니다.');
      return response.json();
    },
    // 방금 전달한 파일이 바로 보여야 하므로 짧게 잡는다. 업로드 성공 시
    // invalidateQueries로 즉시 새로고침되므로, 이 값은 그 사이 자연 갱신용이다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
