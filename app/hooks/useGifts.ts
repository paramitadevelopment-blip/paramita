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
  | { action: 'supplement'; reason: string }
  | { action: 'withdraw'; reason?: string }
  | { action: 'read' }
  // 관리자가 기록 없는 건을 확인한다. 이 뒤로 보통의 신청이 된다.
  | { action: 'check' }
  // 지사가 채워진 배송 정보를 확인한다. 누르면 배지에서 내려간다.
  | { action: 'confirmShip' };

const headers = () => ({
  'Content-Type': 'application/json',
  'X-CSRF-Token': getCsrfToken(),
});

/**
 * @param options.scope 'manage'면 사은품 관리 화면이 부르는 것이다 — 전달된 것부터만
 *                      온다. 관리자가 봐도 지사 안에서 오가는 건은 안 섞인다.
 */
export function useGiftRequests(
  options: { status?: GiftStatus | ''; scope?: 'manage' } = {}
) {
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
    queryKey: [...GIFTS_KEY, options.scope ?? '', page, search, limit, status, group, sort.by, sort.order],
    queryFn: async (): Promise<GiftsResponse> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        status,
        group,
        sortBy: sort.by,
        sortOrder: sort.order,
        ...(options.scope ? { scope: options.scope } : {}),
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
    queryClient.invalidateQueries({ queryKey: GIFT_ORDERS_KEY });
    queryClient.invalidateQueries({ queryKey: ['giftThread'] });
    queryClient.invalidateQueries({ queryKey: ['giftThreads'] });
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
    // 관리자가 지울 때는 사유가 붙는다. 지사는 빈 채로 보낸다.
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const response = await fetch(`/api/gift-requests/${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ reason: reason ?? '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '지우지 못했습니다.');
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
  };
}

/**
 * 고른 신청을 한 번에 확인 처리한다.
 *
 * 건별로 부르지 않는다 — 서른 건이면 서른 번 오가느라 사람이 기다린다.
 * 서버가 한 번의 UPDATE로 끝낸다.
 */
export function useBulkReadGifts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await fetch('/api/gift-requests/read-all', {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ ids }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '확인 처리하지 못했습니다.');
      return result.read as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GIFTS_KEY });
      queryClient.invalidateQueries({ queryKey: GIFT_BADGE_KEY });
    },
  });
}

/**
 * 지사: 송장이 채워졌는데 아직 안 본 건을 한 번에 확인한다.
 *
 * 고를 것이 없다 — 지사는 자기 소속 것만 보므로 서버가 소속으로 범위를 잡는다.
 */
export function useBulkShipRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/gift-requests/read-all', {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ kind: 'ship' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '확인 처리하지 못했습니다.');
      return result.read as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GIFTS_KEY });
      queryClient.invalidateQueries({ queryKey: GIFT_BADGE_KEY });
    },
  });
}

/**
 * 지금 조건에 맞는 발주 대기 건의 아이디 전부.
 *
 * 머리 체크박스는 그 페이지 것만 고른다. 백 건이면 열 페이지를 돌아야 하므로,
 * 검색·지사를 걸어 둔 채로 "발주할 수 있는 것 전부"를 한 번에 받아 온다.
 * 상태는 늘 '발주 대기'다 — 다른 상태는 애초에 고를 수 없다.
 */
export function usePickAllForwarded() {
  const { showAlert } = useAlert();

  return useMutation({
    mutationFn: async (filters: { search?: string; group?: string }): Promise<number[]> => {
      const params = new URLSearchParams({
        idsOnly: 'true',
        scope: 'manage',
        status: 'forwarded',
        search: filters.search ?? '',
        group: filters.group ?? '',
      });
      const response = await fetch(`/api/gift-requests?${params}`, { credentials: 'include' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '목록을 불러올 수 없습니다.');
      return result.ids ?? [];
    },
    onError: (err: Error) => showAlert({ type: 'error', title: '오류', message: err.message }),
  });
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

/**
 * 같은 주문번호로 들어온 신청 전부. 관리자가 재신청을 판정할 때 본다.
 *
 * 목록에 얹지 않고 따로 두는 이유는 크기다 — 주소·사유는 길고, 실제로 읽는
 * 것은 확인 창을 열었을 때뿐이다.
 */
export interface GiftThreadEntry {
  id: number;
  order_no: string;
  customer_name: string;
  gift_name: string;
  quantity: number;
  address: string | null;
  status: GiftStatus;
  check_reason: string | null;
  checked_by: string | null;
  checked_at: string | null;
  requester_name: string;
  group_name: string;
  order_id: number | null;
  order_date: string | null;
  courier: string | null;
  tracking_no: string | null;
  supplement_reason: string | null;
  withdraw_reason: string | null;
  created_at: string;
}

/**
 * 여러 주문번호의 묶음을 한 번에. 확인 대기 목록이 줄마다 묶음을 함께 보여줄 때 쓴다.
 *
 * 줄마다 따로 물으면 한 쪽에 열 번을 묻는다. 목록이 바뀔 때만 다시 묻도록
 * 주문번호를 세워서 열쇠로 삼는다.
 */
export function useGiftThreads(orderNos: string[]) {
  const keys = [...new Set(orderNos.filter(Boolean))].sort();
  return useQuery({
    queryKey: ['giftThreads', keys.join(',')],
    queryFn: async (): Promise<Record<string, GiftThreadEntry[]>> => {
      const params = new URLSearchParams({ orderNos: keys.join(',') });
      const response = await fetch(`/api/gift-requests/threads?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('지난 신청을 불러올 수 없습니다.');
      const result = await response.json();
      return result.data ?? {};
    },
    enabled: keys.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useGiftThread(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['giftThread', id ?? 0],
    queryFn: async (): Promise<GiftThreadEntry[]> => {
      const response = await fetch(`/api/gift-requests/${id}/thread`, { credentials: 'include' });
      if (!response.ok) throw new Error('지난 신청을 불러올 수 없습니다.');
      const result = await response.json();
      return result.data ?? [];
    },
    enabled: enabled && !!id,
    // 확인하는 동안 바뀔 값이 아니다. 창을 여닫아도 다시 묻지 않는다.
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/** 여러 건을 한 번에 넣은 결과. 줄마다 됐는지 안 됐는지가 온다. */
export interface BulkGiftResult {
  /** code가 'duplicate'면 이미 신청된 주문번호 — 사유를 적어 다시 보내면 들어간다. */
  results: Array<{ at: number; ok: boolean; error?: string; code?: string; data?: GiftRequestRow }>;
  created: number;
  failed: number;
}

/**
 * 붙여넣은 여러 건을 한 번에 넣는다.
 *
 * 한 건씩 보내지 않는 이유는 중간에 끊겼을 때 어디까지 들어갔는지 알 수 없기
 * 때문이다. 한 번에 보내고 줄마다 결과를 받는다.
 */
export function useRegisterGifts() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      rows: Array<GiftRequestInput & { pastedName?: string }>;
    }): Promise<BulkGiftResult> => {
      const response = await fetch('/api/gift-requests', {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ rows: input.rows }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '등록하지 못했습니다.');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GIFTS_KEY });
      queryClient.invalidateQueries({ queryKey: GIFT_BADGE_KEY });
    },
    onError: (err: Error) => showAlert({ type: 'error', title: '오류', message: err.message }),
  });
}

/** 발주처가 채워 돌려준 표를 붙여넣은 결과. 줄마다 채웠는지·건너뛰었는지가 온다. */
export interface ShipPasteResultData {
  results: Array<{ at: number; ok: boolean; skipped?: boolean; reason?: string; data?: GiftRequestRow }>;
  filled: number;
  skipped: number;
  failed: number;
  /** 발주는 나갔는데 아직 송장이 안 들어온 건. 발주처에 다시 물어야 할 줄이다. */
  remaining: Array<{
    id: number;
    order_id: number;
    order_no: string;
    customer_name: string;
    gift_name: string;
    quantity: number;
    group_name: string;
  }>;
}

/**
 * 발주처가 채워 준 배송 정보를 한 번에 옮겨 적는다.
 *
 * 주문번호가 우리 것과 맞는 줄만 채운다 — 발주처 파일에는 다른 회사 건이 섞여
 * 있고, 그건 오류가 아니라 남의 줄이다.
 */
export function useShipPaste() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rows: unknown[]): Promise<ShipPasteResultData> => {
      const response = await fetch('/api/gift-requests/ship-paste', {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ rows }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '배송 정보를 채우지 못했습니다.');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GIFTS_KEY });
      queryClient.invalidateQueries({ queryKey: GIFT_BADGE_KEY });
      queryClient.invalidateQueries({ queryKey: GIFT_ORDERS_KEY });
    },
    onError: (err: Error) => showAlert({ type: 'error', title: '오류', message: err.message }),
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

/*
 * 발주 묶음 — 거래처에 나간 발주리스트 한 장.
 *
 * 담당자가 발주 대기 건을 골라 한 장으로 만든다. 만든 장은 '발주리스트' 탭에
 * 쌓이고, 거기서 다시 받거나 건별 배송 정보를 적는다.
 */

export const GIFT_ORDERS_KEY = ['giftOrders'] as const;

export interface GiftOrderSummary {
  id: number;
  created_by: string;
  created_at: string;
  note: string | null;
  /** 지금 실려 있는 건수. 보완으로 빠진 건은 안 센다. */
  count: number;
  /** 그중 송장이 들어온 건수. 실린 수와 다르면 발주처에서 덜 받은 것이다. */
  shipped: number;
  groups: string[];
}

/** 만든 발주리스트 목록. 한 장이 한 줄이다. */
export function useGiftOrders(enabled = true) {
  return useQuery({
    queryKey: GIFT_ORDERS_KEY,
    queryFn: async (): Promise<GiftOrderSummary[]> => {
      const response = await fetch('/api/gift-orders', { credentials: 'include' });
      if (!response.ok) throw new Error('발주리스트를 불러올 수 없습니다.');
      const result = await response.json();
      return result.data ?? [];
    },
    enabled,
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/** 발주리스트 한 장과 거기 실린 건들. */
export function useGiftOrder(id: number | null) {
  return useQuery({
    queryKey: [...GIFT_ORDERS_KEY, id ?? 0],
    queryFn: async (): Promise<{ order: GiftOrderSummary; items: GiftRequestRow[] }> => {
      const response = await fetch(`/api/gift-orders/${id}`, { credentials: 'include' });
      if (!response.ok) throw new Error('발주리스트를 불러올 수 없습니다.');
      const result = await response.json();
      return result.data;
    },
    enabled: !!id,
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useCreateGiftOrder() {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      ids: number[]
    ): Promise<{ order: { id: number }; ordered: number; skipped: number }> => {
      const response = await fetch('/api/gift-orders', {
        method: 'POST',
        credentials: 'include',
        headers: headers(),
        body: JSON.stringify({ ids }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '발주 묶음을 만들지 못했습니다.');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GIFTS_KEY });
      queryClient.invalidateQueries({ queryKey: GIFT_BADGE_KEY });
      queryClient.invalidateQueries({ queryKey: GIFT_ORDERS_KEY });
    },
    onError: (err: Error) => showAlert({ type: 'error', title: '오류', message: err.message }),
  });
}

/** 발주 묶음을 거래처 양식 엑셀로 내려받는다. 몇 번이고 다시 받을 수 있다. */
export async function downloadGiftOrderExcel(orderId: number): Promise<void> {
  const response = await fetch(`/api/gift-orders/${orderId}/excel`, { credentials: 'include' });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || '엑셀을 내려받지 못했습니다.');
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const fileName = match ? decodeURIComponent(match[1]) : `발주리스트_${orderId}.xlsx`;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface GiftBadgeCounts {
  /** 사은품 신청 메뉴: 지사는 보완 요청 받은 것 + 안 본 배송 정보, 관리자는 확인 대기. */
  requests: number;
  /** 사은품 관리 메뉴: 발주 대기. */
  manage: number;
  /**
   * `requests`를 상태 탭별로 쪼갠 것. 합은 언제나 `requests`와 같다 —
   * 옆 메뉴의 숫자를 보고 어느 탭을 눌러야 할지 화면에서 바로 찾으라고 있다.
   */
  tabs: Partial<Record<GiftStatus, number>>;
}

export function useGiftBadgeCount(enabled = true) {
  return useQuery({
    queryKey: GIFT_BADGE_KEY,
    queryFn: async (): Promise<GiftBadgeCounts> => {
      const response = await fetch('/api/gift-requests/badge-count', { credentials: 'include' });
      if (!response.ok) return { requests: 0, manage: 0, tabs: {} };
      const result = await response.json();
      return {
        requests: result.requests ?? 0,
        manage: result.manage ?? 0,
        tabs: result.tabs ?? {},
      };
    },
    enabled,
    // 사이드바는 모든 화면에 떠 있다. 너무 자주 물으면 화면마다 요청이 붙는다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}
