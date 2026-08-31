import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';

/**
 * 재신청 고객 알림.
 *
 * 지사가 자기 소속 것만 본다. 거르는 건 서버가 하고, 여기서는 조회 조건만 든다.
 */

export interface ReapplyNotice {
  id: number;
  customer_name: string | null;
  birth: string | null;
  tel1: string | null;
  tel2: string | null;
  product_name: string | null;
  reason: string;
  order_no: string | null;
  source_file_id: string | null;
  source_file_name: string | null;
  applied_at: string;
  /** 직전에 받았던 배정 분류 ('파라인슈1') */
  assigned_dept: string;
  /** 그 분류가 속한 조직 ('파라인슈') = 사용자 소속 */
  assigned_group: string;
  /** 직전에 신청해서 배정됐을 때의 접수일자 */
  previous_applied_at: string | null;
  assigned_file_id: string | null;
  assigned_file_name: string | null;
  read_at: string | null;
  /** 확인한 사람. 계정을 지웠으면 이름이 없고 시각만 남는다. */
  read_by_name: string | null;
  created_at: string;
}

export interface ReapplyResponse {
  data: ReapplyNotice[];
  pagination: { page: number; limit: number; totalRecords: number; totalPages: number };
}

export function useReapplyNotices() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearchValue] = useState('');
  const [limit, setLimitValue] = useState(10);
  const [unreadOnly, setUnreadOnlyValue] = useState(false);
  // 관리자만 쓴다. 지사는 서버가 자기 소속으로 고정하므로 이 값이 무시된다.
  const [group, setGroupValue] = useState('');
  const [sort, setSort] = useState<{ by: string; order: 'asc' | 'desc' }>({
    by: 'applied_at',
    order: 'desc',
  });

  const query = useQuery({
    queryKey: ['reapplyNotices', page, search, limit, sort.by, sort.order, unreadOnly, group],
    queryFn: async (): Promise<ReapplyResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        sortBy: sort.by,
        sortOrder: sort.order,
        unreadOnly: String(unreadOnly),
        group,
      });

      const response = await fetch(`/api/reapply-notices?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('목록을 불러올 수 없습니다.');
      return response.json();
    },
    // 배포할 때만 늘어난다. 자주 바뀌는 값이 아니라 잠시 캐시해 둔다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const readMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch('/api/reapply-notices', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '확인 처리에 실패했습니다.');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reapplyNotices'] });
      // 사이드바 배지도 같이 맞춘다. 안 그러면 확인했는데 숫자가 그대로다.
      queryClient.invalidateQueries({ queryKey: ['reapplyNotices', 'unreadCount'] });
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

  const setUnreadOnly = useCallback((value: boolean) => {
    setUnreadOnlyValue(value);
    setPage(1);
  }, []);

  const setGroup = useCallback((value: string) => {
    setGroupValue(value);
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
    page,
    search,
    limit,
    unreadOnly,
    group,
    setGroup,
    sortBy: sort.by,
    sortOrder: sort.order,
    setSearch,
    setLimit,
    setUnreadOnly,
    setSortBy,
    toggleSort,
    changePage,

    notices: query.data?.data ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    error: query.error,

    markRead: readMutation.mutate,
    isMarking: readMutation.isPending,
  };
}

/**
 * 사이드바 배지용 안 읽은 건수.
 *
 * 목록을 1건만 받아 총 건수만 쓴다. 다른 창에서 확인 처리하면 이 창의 캐시로는
 * 알 수 없으므로 주기적으로만 맞춘다 (다운로드 승인 배지와 같은 방식).
 */
export function useUnreadReapplyCount(enabled: boolean) {
  return useQuery({
    queryKey: ['reapplyNotices', 'unreadCount'],
    queryFn: async () => {
      const response = await fetch('/api/reapply-notices?unreadOnly=true&page=1&limit=1', {
        credentials: 'include',
      });
      if (!response.ok) return 0;
      const result = await response.json();
      return (result?.pagination?.totalRecords as number) || 0;
    },
    enabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
