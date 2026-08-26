import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';

export interface BlacklistRecord {
  id: number;
  customer_name: string | null;
  product_name: string;
  birth: string | null;
  tel1: string | null;
  tel2: string | null;
  reason: string;
  request_count: number;
  /** 명단에 오른 경로. system = 배포가 규칙으로, admin = 관리자가 손으로 */
  registered_by: 'system' | 'admin';
  source_file_id: string | null;
  source_file_name: string | null;
  /** 신청 건별 출처. 신청횟수와 줄 수가 맞는다. */
  source_files?: Array<{
    id: string | null;
    name: string;
    orderNo?: string;
    customerName?: string;
    product?: string;
  }>;
  registered_at: string;
  released_at: string | null;
  release_reason: string | null;
  history?: Array<{
    id: number;
    action: 'registered' | 'released';
    reason: string | null;
    created_at: string;
  }>;
}

/**
 * 블랙리스트 명단 조회·등록·해제.
 *
 * 조회 조건과 서버 호출을 화면에서 떼어낸다. 컴포넌트가 이것들을 다 들고 있으면
 * 모달 하나 고치려고 열었다가 쿼리 키까지 훑게 된다.
 */

export interface BlacklistResponse {
  data: BlacklistRecord[];
  pagination: {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
  };
}

/** 화면에서 받아 서버로 보내는 등록 값 */
export interface BlacklistRegisterInput {
  customerName: string;
  birth: string;
  tel1: string;
  tel2: string;
  reason: string;
}

export function useBlacklist() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearchValue] = useState('');
  const [limit, setLimitValue] = useState(10);
  // 두 값이 늘 함께 바뀐다. 따로 두면 한쪽만 갱신된 중간 상태가 생겨
  // 열은 바뀌었는데 방향이 이전 것인 채로 한 번 더 조회된다.
  const [sort, setSort] = useState<{ by: string; order: 'asc' | 'desc' }>({
    by: 'registered_at',
    order: 'desc',
  });
  // 차단 중인 명단과 해제된 이력 중 하나만 본다. 기본은 차단 중인 쪽이다.
  const [onlyReleased, setOnlyReleasedValue] = useState(false);

  const query = useQuery({
    queryKey: ['blacklist', page, search, limit, sort.by, sort.order, onlyReleased],
    queryFn: async (): Promise<BlacklistResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        sortBy: sort.by,
        sortOrder: sort.order,
        status: onlyReleased ? 'released' : 'active',
      });

      const response = await fetch(`/api/blacklist?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('블랙리스트를 불러올 수 없습니다.');
      return response.json();
    },
    // 명단은 배포할 때만 늘어난다. 자주 바뀌는 값이 아니라 잠시 캐시해 둔다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['blacklist'] }),
    [queryClient]
  );

  const registerMutation = useMutation({
    mutationFn: async (input: BlacklistRegisterInput) => {
      const response = await fetch('/api/blacklist', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify(input),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '등록에 실패했습니다.');
      return result;
    },
    onSuccess: () => {
      invalidate();
      showAlert({ type: 'success', title: '완료', message: '블랙리스트에 등록되었습니다.' });
    },
    onError: (err: Error) => {
      showAlert({ type: 'error', title: '오류', message: err.message });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      const response = await fetch(`/api/blacklist?id=${id}&reason=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '해제에 실패했습니다.');
      return result as { releasedCount?: number };
    },
    onSuccess: (result) => {
      invalidate();

      // 같은 사람이 여러 줄로 올라 있으면 한꺼번에 풀린다. 몇 줄이 풀렸는지
      // 안 알려주면 관리자가 다른 줄까지 사라진 걸 보고 잘못 눌렀다고 여긴다.
      const count = result?.releasedCount ?? 1;
      showAlert({
        type: 'success',
        title: '완료',
        message:
          count > 1
            ? `같은 번호로 등록된 ${count}건이 함께 해제되었습니다.`
            : '블랙리스트에서 해제되었습니다.',
      });
    },
    onError: (err: Error) => {
      showAlert({ type: 'error', title: '오류', message: err.message });
    },
  });

  // 조건이 바뀌면 1페이지로 돌아간다. 3페이지를 보다 조건을 바꾸면
  // 결과가 세 쪽도 안 되는데 3페이지를 달라고 해서 빈 화면이 뜬다.
  const setSearch = useCallback((value: string) => {
    setSearchValue(value);
    setPage(1);
  }, []);

  const setLimit = useCallback((value: number) => {
    setLimitValue(value);
    setPage(1);
  }, []);

  const setOnlyReleased = useCallback((value: boolean) => {
    setOnlyReleasedValue(value);
    setPage(1);
  }, []);

  /** 같은 열을 다시 누르면 방향만 뒤집는다. */
  const toggleSort = useCallback((column: string) => {
    setSort((current) =>
      current.by === column
        ? { by: column, order: current.order === 'asc' ? 'desc' : 'asc' }
        : { by: column, order: 'asc' }
    );
    setPage(1);
  }, []);

  /** 드롭다운으로 고를 때. 보던 방향은 그대로 둔다. */
  const setSortBy = useCallback((column: string) => {
    setSort((current) => ({ ...current, by: column }));
    setPage(1);
  }, []);

  const changePage = useCallback((next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return {
    // 조회 조건
    page,
    search,
    limit,
    sortBy: sort.by,
    sortOrder: sort.order,
    onlyReleased,
    setSearch,
    setLimit,
    setSortBy,
    setOnlyReleased,
    toggleSort,
    changePage,

    // 데이터
    records: query.data?.data ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    error: query.error,

    // 쓰기
    register: registerMutation.mutate,
    isRegistering: registerMutation.isPending,
    release: releaseMutation.mutate,
    isReleasing: releaseMutation.isPending,
  };
}
