import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

/**
 * 로그인 기록.
 *
 * 관리자만 본다. 거르는 건 서버가 하고 여기서는 조회 조건만 든다.
 */

export interface LoginRecord {
  id: number;
  user_id: number | null;
  /** 입력한 아이디 그대로. 없는 아이디로 시도한 것도 남는다 */
  username: string;
  user_name: string | null;
  user_department: string | null;
  user_role: string | null;
  success: boolean;
  fail_reason: string | null;
  ip_address: string | null;
  device_type: string | null;
  os_name: string | null;
  browser_name: string | null;
  logged_in_at: string;
}

export type LoginStatus = 'all' | 'success' | 'failed';

export interface LoginRecordsResponse {
  data: LoginRecord[];
  pagination: { page: number; limit: number; totalRecords: number; totalPages: number };
}

export function useLoginRecords() {
  const [page, setPage] = useState(1);
  const [search, setSearchValue] = useState('');
  const [limit, setLimitValue] = useState(20);
  const [status, setStatusValue] = useState<LoginStatus>('all');
  const [sort, setSort] = useState<{ by: string; order: 'asc' | 'desc' }>({
    by: 'logged_in_at',
    order: 'desc',
  });

  const query = useQuery({
    queryKey: ['loginRecords', page, search, limit, status, sort.by, sort.order],
    queryFn: async (): Promise<LoginRecordsResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        status,
        sortBy: sort.by,
        sortOrder: sort.order,
      });

      const response = await fetch(`/api/login-records?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('기록을 불러올 수 없습니다.');
      return response.json();
    },
    // 로그인할 때마다 늘어난다. 잠깐 캐시해 두되 오래 붙들지는 않는다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
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

  const setStatus = useCallback((value: LoginStatus) => {
    setStatusValue(value);
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
    status,
    sortBy: sort.by,
    sortOrder: sort.order,
    setSearch,
    setLimit,
    setStatus,
    setSortBy,
    toggleSort,
    changePage,

    records: query.data?.data ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    error: query.error,
  };
}
