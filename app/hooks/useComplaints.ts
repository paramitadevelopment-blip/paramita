import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import type { ComplaintFilter, ComplaintRow, ComplaintStatus } from '@/lib/complaints';

/**
 * 민원 목록과 상태 변경.
 *
 * 누가 무엇을 보는지는 서버가 정한다 — 여기서는 조회 조건만 든다.
 * 화면에서 거르면 요청을 직접 만들어 남의 지사 것을 받아 갈 수 있다.
 */

export const COMPLAINTS_KEY = ['complaints'] as const;
export const UNREAD_COMPLAINTS_KEY = ['complaints', 'unreadCount'] as const;

export interface ComplaintsResponse {
  data: ComplaintRow[];
  pagination: { page: number; limit: number; totalRecords: number; totalPages: number };
}

/** 민원담당자가 새로 넣을 때 채우는 값. 메일에 오는 항목 그대로다. */
export interface ComplaintInput {
  product: string;
  customerName: string;
  phone: string;
  orderNo: string;
  receivedAt: string;
  orderConfirmedAt: string;
  calledAt: string;
  callMemo: string;
}

type PatchBody =
  | { action: 'assign_dept'; group: string }
  | { action: 'return'; reason: string }
  | { action: 'bounce'; reason: string }
  | { action: 'handle'; note: string }
  | { action: 'read' }
  | { action: 'withdraw'; reason?: string }
  | ({ action: 'update' } & ComplaintInput);

export function useComplaints(options: { status?: ComplaintFilter } = {}) {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearchValue] = useState('');
  const [limit, setLimitValue] = useState(10);
  const [status, setStatusValue] = useState<ComplaintFilter>(options.status ?? '');
  // 관리자만 쓴다. 지사는 서버가 자기 범위로 고정한다.
  const [group, setGroupValue] = useState('');
  // 밀린 건만 보기. 목록을 훑어서는 안 보이는 것을 드러낸다.
  const [overdueOnly, setOverdueOnlyValue] = useState(false);
  const [sort, setSort] = useState<{ by: string; order: 'asc' | 'desc' }>({
    by: 'created_at',
    order: 'desc',
  });

  const query = useQuery({
    queryKey: [...COMPLAINTS_KEY, page, search, limit, status, group, overdueOnly, sort.by, sort.order],
    queryFn: async (): Promise<ComplaintsResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        status,
        group,
        overdueOnly: String(overdueOnly),
        sortBy: sort.by,
        sortOrder: sort.order,
      });
      const response = await fetch(`/api/complaints?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('목록을 불러올 수 없습니다.');
      return response.json();
    },
    /*
     * 사람이 손으로 넣고 넘기는 값이라 자주 바뀌지 않는다. 다만 지사가 넘긴
     * 직후 지사가 봐야 하므로 재신청 알림(30초)보다 짧게 둔다.
     */
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: PatchBody }) => {
      const response = await fetch(`/api/complaints/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '처리하지 못했습니다.');
      return result;
    },
    onSuccess: () => {
      // 목록을 다시 받는다. 화면 새로고침으로 맞추지 않는다.
      queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY });
      // 사이드바 배지도 같이 맞춘다. 안 그러면 확인했는데 숫자가 그대로다.
      queryClient.invalidateQueries({ queryKey: UNREAD_COMPLAINTS_KEY });
    },
    onError: (err: Error) => {
      showAlert({ type: 'error', title: '오류', message: err.message });
    },
  });

  // 조건이 바뀌면 1페이지로. 3페이지를 보다 조건을 바꾸면 빈 화면이 뜬다.
  const setSearch = useCallback((value: string) => {
    setSearchValue(value);
    setPage(1);
  }, []);

  const setLimit = useCallback((value: number) => {
    setLimitValue(value);
    setPage(1);
  }, []);

  const setStatus = useCallback((value: ComplaintFilter) => {
    setStatusValue(value);
    setPage(1);
  }, []);

  const setGroup = useCallback((value: string) => {
    setGroupValue(value);
    setPage(1);
  }, []);

  const setOverdueOnly = useCallback((value: boolean) => {
    setOverdueOnlyValue(value);
    setPage(1);
  }, []);

  /** 드롭다운으로 고를 때. 보던 방향은 그대로 둔다. */
  const setSortBy = useCallback((column: string) => {
    setSort((current) => ({ ...current, by: column }));
    setPage(1);
  }, []);

  /** 열 머리를 누를 때. 같은 열을 다시 누르면 방향만 뒤집는다. */
  const toggleSort = useCallback((column: string) => {
    setSort((current) =>
      current.by === column
        ? { by: column, order: current.order === 'asc' ? 'desc' : 'asc' }
        : { by: column, order: 'asc' }
    );
    setPage(1);
  }, []);

  /*
   * 지우기. 관리자는 사유를 함께 보낸다 — 서버가 보관본에 그 사유를 적는다.
   * 넣은 사람이 아무도 안 본 건을 물릴 때는 사유가 없다.
   */
  const removeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const response = await fetch(`/api/complaints/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({ reason: reason ?? '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '지우지 못했습니다.');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY });
      // 지운 건이 배지에 남아 있으면 눌러도 아무것도 없는 숫자가 된다.
      queryClient.invalidateQueries({ queryKey: UNREAD_COMPLAINTS_KEY });
    },
    onError: (err: Error) => {
      showAlert({ type: 'error', title: '오류', message: err.message });
    },
  });

  const changePage = useCallback((next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return {
    complaints: query.data?.data ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,

    page,
    search,
    limit,
    status,
    group,
    overdueOnly,
    sort,

    setSearch,
    setLimit,
    setStatus,
    setGroup,
    setOverdueOnly,
    setSortBy,
    toggleSort,
    changePage,

    patch: patchMutation.mutateAsync,
    isPatching: patchMutation.isPending,

    remove: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}

/**
 * 고른 민원을 한 번에 확인 처리한다.
 *
 * 건별로 부르지 않는다 — 서른 건이면 서른 번 오가느라 사람이 기다린다.
 * 서버가 한 번의 UPDATE로 끝내고, 아직 안 본 것만 찍으므로 처음 본 시각은
 * 덮이지 않는다.
 */
export function useBulkReadComplaints() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await fetch('/api/complaints/read-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({ ids }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '확인 처리하지 못했습니다.');
      return result.read as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_COMPLAINTS_KEY });
    },
  });
}

/**
 * 아직 확인 안 한 건의 아이디 전부.
 *
 * 상세를 하나씩 여는 것이 원래 길인데 스무 건이면 스무 번 열어야 한다.
 * 검색·소속을 걸어 둔 채로 미확인 건만 받아 온다.
 */
export function useUnreadComplaintIds() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async (filters: { search?: string; group?: string }): Promise<number[]> => {
      const params = new URLSearchParams({
        unreadIds: 'true',
        search: filters.search ?? '',
        group: filters.group ?? '',
      });
      const response = await fetch(`/api/complaints?${params}`, { credentials: 'include' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '목록을 불러올 수 없습니다.');
      return result.ids ?? [];
    },
    onError: (err: Error) => showAlert({ type: 'error', title: '오류', message: err.message }),
  });
}

/**
 * 민원 접수.
 *
 * 등록 화면에서만 쓴다. 목록 조회와 한 훅에 두면 등록 화면이 안 쓰는 조회
 * 상태까지 들고 다니게 된다.
 */
export function useRegisterComplaint() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ComplaintInput): Promise<ComplaintRow> => {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '민원을 등록하지 못했습니다.');
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY });
    },
    onError: (err: Error) => {
      showAlert({ type: 'error', title: '오류', message: err.message });
    },
  });
}

/** 여러 건을 한 번에 접수한 결과. 줄마다 됐는지 안 됐는지가 온다. */
export interface BulkRegisterResult {
  results: Array<{ at: number; ok: boolean; error?: string; data?: ComplaintRow }>;
  created: number;
  failed: number;
}

/**
 * 붙여넣은 여러 건을 한 번에 접수한다.
 *
 * 한 건씩 보내지 않는 이유는 중간에 끊겼을 때 어디까지 들어갔는지 알 수 없기
 * 때문이다. 한 번에 보내고 줄마다 결과를 받는다.
 */
export function useRegisterComplaints() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rows: ComplaintInput[]): Promise<BulkRegisterResult> => {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
        body: JSON.stringify({ rows }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '민원을 등록하지 못했습니다.');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_COMPLAINTS_KEY });
    },
    onError: (err: Error) => {
      showAlert({ type: 'error', title: '오류', message: err.message });
    },
  });
}

/**
 * 사이드바 배지에 띄울 '내가 손대야 할 건수'.
 *
 * 무엇을 세는지는 서버가 역할을 보고 정한다 — 화면에서 정하면 역할이 늘 때마다
 * 두 곳을 고쳐야 하고, 한쪽만 고치면 눌러도 아무것도 없는 배지가 뜬다.
 */
export interface ComplaintBadgeCounts {
  /** 민원 등록: 내가 넣었다가 보완 요청을 받아 돌아온 건. */
  register: number;
  /** 민원관리: 담당 지사를 못 찾았거나, 안 봤거나, 며칠째 안 끝난 건. */
  manage: number;
  /**
   * 위 숫자를 **어느 상태 탭에 있는지**로 쪼갠 것. 합은 언제나 위와 같다 —
   * 옆 메뉴의 숫자를 보고 어느 탭을 눌러야 할지 화면에서 바로 찾으라고 있다.
   */
  registerTabs: Partial<Record<ComplaintFilter, number>>;
  manageTabs: Partial<Record<ComplaintFilter, number>>;
}

const NO_BADGE: ComplaintBadgeCounts = {
  register: 0,
  manage: 0,
  registerTabs: {},
  manageTabs: {},
};

export function useUnreadComplaintCount(enabled = true) {
  return useQuery({
    queryKey: UNREAD_COMPLAINTS_KEY,
    queryFn: async (): Promise<ComplaintBadgeCounts> => {
      const response = await fetch('/api/complaints/unread-count', { credentials: 'include' });
      if (!response.ok) return NO_BADGE;
      const result = await response.json();
      return {
        register: result.register ?? 0,
        manage: result.manage ?? 0,
        registerTabs: result.registerTabs ?? {},
        manageTabs: result.manageTabs ?? {},
      };
    },
    enabled,
    // 사이드바는 모든 화면에 떠 있다. 너무 자주 물으면 화면마다 요청이 붙는다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** 같은 건의 지난 민원. 처리 창을 열었을 때만 받는다 — 통화내역과 처리 내용은 길다. */
export interface ThreadEntry {
  id: number;
  sequence_no: number;
  called_at: string | null;
  call_memo: string | null;
  product: string | null;
  status: ComplaintStatus;
  handled_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}

export function useComplaintThread(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['complaintThread', id ?? 0],
    queryFn: async (): Promise<ThreadEntry[]> => {
      const response = await fetch(`/api/complaints/${id}/thread`, { credentials: 'include' });
      if (!response.ok) throw new Error('지난 민원을 불러올 수 없습니다.');
      const result = await response.json();
      return result.data ?? [];
    },
    enabled: enabled && !!id,
    // 처리하는 동안 바뀔 값이 아니다. 창을 여닫아도 다시 묻지 않는다.
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
