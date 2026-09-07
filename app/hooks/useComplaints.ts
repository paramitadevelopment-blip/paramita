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
  | { action: 'assign_agent'; agentId: number }
  | { action: 'handle'; note: string }
  | { action: 'read' }
  | ({ action: 'update' } & ComplaintInput);

export function useComplaints(options: { status?: ComplaintFilter } = {}) {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearchValue] = useState('');
  const [limit, setLimitValue] = useState(10);
  const [status, setStatusValue] = useState<ComplaintFilter>(options.status ?? '');
  // 관리자만 쓴다. 지사·설계사는 서버가 자기 범위로 고정한다.
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
     * 직후 설계사가 봐야 하므로 재신청 알림(30초)보다 짧게 둔다.
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

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/complaints/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '지우지 못했습니다.');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPLAINTS_KEY });
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
  /** 민원 등록: 내가 넣었다가 반려돼 돌아온 건. */
  register: number;
  /** 민원관리: 담당 지사를 못 찾았거나, 안 봤거나, 며칠째 안 끝난 건. */
  manage: number;
}

const NO_BADGE: ComplaintBadgeCounts = { register: 0, manage: 0 };

export function useUnreadComplaintCount(enabled = true) {
  return useQuery({
    queryKey: UNREAD_COMPLAINTS_KEY,
    queryFn: async (): Promise<ComplaintBadgeCounts> => {
      const response = await fetch('/api/complaints/unread-count', { credentials: 'include' });
      if (!response.ok) return NO_BADGE;
      const result = await response.json();
      return { register: result.register ?? 0, manage: result.manage ?? 0 };
    },
    enabled,
    // 사이드바는 모든 화면에 떠 있다. 너무 자주 물으면 화면마다 요청이 붙는다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** 지사가 고를 수 있는 소속 설계사. 관리자는 지사를 지정해야 나온다. */
export function useComplaintAgents(group?: string, enabled = true) {
  return useQuery({
    queryKey: ['complaintAgents', group ?? ''],
    queryFn: async (): Promise<Array<{ id: number; name: string; username: string }>> => {
      const params = group ? `?group=${encodeURIComponent(group)}` : '';
      const response = await fetch(`/api/complaints/agents${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('설계사 목록을 불러올 수 없습니다.');
      const result = await response.json();
      return result.data ?? [];
    },
    enabled,
    // 계정이 자주 늘지 않는다. 길게 잡아 목록을 다시 받지 않게 한다.
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
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
