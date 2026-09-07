import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import type {
  GiftPrefill,
  GiftRequestInput,
  GiftRequestRow,
  GiftShipInput,
  GiftStatus,
} from '@/lib/gifts';

/**
 * 사은품 신청 목록과 상태 변경.
 *
 * 누가 무엇을 보는지는 서버가 정한다 — 여기서는 조회 조건만 든다.
 * 화면에서 거르면 요청을 직접 만들어 남의 지사 것을 받아 갈 수 있다.
 */

export const GIFTS_KEY = ['giftRequests'] as const;
export const GIFT_BADGE_KEY = ['giftRequests', 'badge'] as const;

export interface GiftsResponse {
  data: GiftRequestRow[];
  pagination: { page: number; limit: number; totalRecords: number; totalPages: number };
}

type PatchBody =
  | ({ action: 'update' } & Omit<GiftRequestInput, 'orderNo'>)
  | ({ action: 'ship' } & GiftShipInput)
  | { action: 'supplement'; reason: string };

const headers = () => ({
  'Content-Type': 'application/json',
  'X-CSRF-Token': getCsrfToken(),
});

export function useGiftRequests(options: { status?: GiftStatus | '' } = {}) {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearchValue] = useState('');
  const [limit, setLimitValue] = useState(10);
  const [status, setStatusValue] = useState<GiftStatus | ''>(options.status ?? '');
  // 관리자·사은품담당자만 쓴다. 지사·설계사는 서버가 자기 범위로 고정한다.
  const [group, setGroupValue] = useState('');
  const [sort, setSort] = useState<{ by: string; order: 'asc' | 'desc' }>({
    by: 'created_at',
    order: 'desc',
  });

  const query = useQuery({
    queryKey: [...GIFTS_KEY, page, search, limit, status, group, sort.by, sort.order],
    queryFn: async (): Promise<GiftsResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        status,
        group,
        sortBy: sort.by,
        sortOrder: sort.order,
      });
      const response = await fetch(`/api/gift-requests?${params}`, { credentials: 'include' });
      if (!response.ok) throw new Error('목록을 불러올 수 없습니다.');
      return response.json();
    },
    // 사람이 손으로 넣고 넘기는 값이라 자주 바뀌지 않는다.
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
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
  const setStatus = useCallback((value: GiftStatus | '') => {
    setStatusValue(value);
    setPage(1);
  }, []);
  const setGroup = useCallback((value: string) => {
    setGroupValue(value);
    setPage(1);
  }, []);
  const setSortBy = useCallback((column: string) => {
    setSort((current) => ({ ...current, by: column }));
    setPage(1);
  }, []);
  const toggleSort = useCallback((column: string) => {
    setSort((current) =>
      current.by === column
        ? { by: column, order: current.order === 'asc' ? 'desc' : 'asc' }
        : { by: column, order: 'asc' }
    );
    setPage(1);
  }, []);
  const changePage = useCallback((next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: GIFTS_KEY });
    queryClient.invalidateQueries({ queryKey: GIFT_BADGE_KEY });
  };

  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: PatchBody }) => {
      const response = await fetch(`/api/gift-requests/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '처리하지 못했습니다.');
      return result;
    },
    onSuccess: refresh,
    onError: (err: Error) => showAlert({ type: 'error', title: '오류', message: err.message }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/gift-requests/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '지우지 못했습니다.');
      return result;
    },
    onSuccess: refresh,
    onError: (err: Error) => showAlert({ type: 'error', title: '오류', message: err.message }),
  });

  /** 지사가 골라 사은품담당자에게 보낸다. 몇 건이 갔고 몇 건이 빠졌는지 돌려준다. */
  const forwardMutation = useMutation({
    mutationFn: async (ids: number[]): Promise<{ forwarded: number; skipped: number }> => {
      const response = await fetch('/api/gift-requests/forward', {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ ids }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '전달하지 못했습니다.');
      return result;
    },
    onSuccess: refresh,
    onError: (err: Error) => showAlert({ type: 'error', title: '오류', message: err.message }),
  });

  return {
    rows: query.data?.data ?? [],
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    isError: query.isError,

    page,
    search,
    limit,
    status,
    group,
    sort,

    setSearch,
    setLimit,
    setStatus,
    setGroup,
    setSortBy,
    toggleSort,
    changePage,

    patch: patchMutation.mutateAsync,
    isPatching: patchMutation.isPending,
    remove: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
    forward: forwardMutation.mutateAsync,
    isForwarding: forwardMutation.isPending,
  };
}

/** 주문번호로 신청서를 미리 채운다. 성공하면 채울 값, 실패하면 이유를 던진다. */
export function useGiftLookup() {
  return useMutation({
    mutationFn: async (orderNo: string): Promise<GiftPrefill> => {
      const params = new URLSearchParams({ orderNo });
      const response = await fetch(`/api/gift-requests/lookup?${params}`, {
        credentials: 'include',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '고객을 찾지 못했습니다.');
      return result.data;
    },
  });
}

export function useRequestGift() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: GiftRequestInput): Promise<GiftRequestRow> => {
      const response = await fetch('/api/gift-requests', {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '신청하지 못했습니다.');
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GIFTS_KEY });
      queryClient.invalidateQueries({ queryKey: GIFT_BADGE_KEY });
    },
    onError: (err: Error) => showAlert({ type: 'error', title: '오류', message: err.message }),
  });
}

export interface GiftBadgeCounts {
  /** 사은품 신청 메뉴: 지사는 전달할 것, 설계사는 보완 요청 받은 것. */
  requests: number;
  /** 사은품 관리 메뉴: 발주 대기. */
  manage: number;
}

export function useGiftBadgeCount(enabled = true) {
  return useQuery({
    queryKey: GIFT_BADGE_KEY,
    queryFn: async (): Promise<GiftBadgeCounts> => {
      const response = await fetch('/api/gift-requests/badge-count', { credentials: 'include' });
      if (!response.ok) return { requests: 0, manage: 0 };
      const result = await response.json();
      return { requests: result.requests ?? 0, manage: result.manage ?? 0 };
    },
    enabled,
    // 사이드바는 모든 화면에 떠 있다. 너무 자주 물으면 화면마다 요청이 붙는다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}
