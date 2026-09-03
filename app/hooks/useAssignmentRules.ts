import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import type { DepartmentRule } from '@/lib/assignmentRules';

/**
 * 배정 규칙 — 어느 소속이 어느 지역·나이대를 받는가.
 *
 * 분류 결과가 이 설정을 따라 달라지므로, 저장하면 분류 캐시를 비운다.
 */

/*
 * 캐시 키. 소속을 만들거나 지우는 쪽(useDepartments)에서도 이 키로 비운다 —
 * 지역설정 표의 열이 소속 목록에서 만들어지기 때문이다.
 * 문자열을 양쪽에 따로 적어 두면 한쪽만 고쳐도 아무 일 없이 지나가고,
 * 새로 만든 소속이 새로고침 전까지 안 보이는 것으로만 드러난다.
 */
export const ASSIGNMENT_RULES_KEY = ['assignmentRules'] as const;

export interface AssignmentRulesResponse {
  /** 배정을 붙일 수 있는 조직들. 표의 열이 된다 */
  groups: string[];
  rules: DepartmentRule[];
  updatedAt: string | null;
  updatedBy: string | null;
}

export function useAssignmentRules(enabled: boolean) {
  return useQuery({
    queryKey: ASSIGNMENT_RULES_KEY,
    queryFn: async (): Promise<AssignmentRulesResponse> => {
      const res = await fetch('/api/assignment-rules', { credentials: 'include' });
      if (!res.ok) throw new Error('배정 규칙을 불러오지 못했습니다.');
      return res.json();
    },
    // 설정 화면을 열 때만 받는다. 자주 바뀌는 값이 아니라 길게 잡아도 된다.
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled,
  });
}

/** 저장 이력 한 건 */
export interface AssignmentRuleLog {
  id: number;
  changedAt: string;
  changedBy: string | null;
  changedByName: string | null;
  rules: DepartmentRule[];
}

export const ASSIGNMENT_RULE_LOGS_KEY = ['assignmentRuleLogs'] as const;

export interface AssignmentRuleLogPage {
  logs: AssignmentRuleLog[];
  /**
   * 목록 바로 앞의 기록. 마지막 줄의 '이전 상태'를 계산하는 데 쓴다.
   * 기간을 좁혀 보면 이 값이 그 기간 밖에 있어 서버가 따로 읽어 준다.
   */
  previous: AssignmentRuleLog | null;
  /** 더 있는데 잘렸는가 */
  hasMore: boolean;
}

/**
 * 저장 이력. 로그 창을 열 때만 받는다 — 설정만 보고 닫는 사람이 대부분이라
 * 모달을 열 때마다 같이 받아오면 안 쓰는 값을 매번 퍼 올린다.
 *
 * @param range 그 날짜의 시작·끝 시각(ISO). 안 주면 최근 것부터 받는다.
 *              날짜 경계는 보는 사람 시간대에서 정해지므로 화면이 만들어 넘긴다.
 */
export function useAssignmentRuleLogs(
  enabled: boolean,
  range?: { from: string; to: string } | null
) {
  return useQuery({
    // 기간이 키에 들어가야 날짜를 바꿀 때마다 다시 받아온다.
    queryKey: [...ASSIGNMENT_RULE_LOGS_KEY, range?.from ?? null, range?.to ?? null],
    queryFn: async (): Promise<AssignmentRuleLogPage> => {
      const query = range ? `?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` : '';
      const res = await fetch(`/api/assignment-rules/logs${query}`, { credentials: 'include' });
      if (!res.ok) throw new Error('저장 이력을 불러오지 못했습니다.');
      return res.json();
    },
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useSaveAssignmentRules() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rules: DepartmentRule[]) => {
      const res = await fetch('/api/assignment-rules', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify({ rules }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || '배정 규칙을 저장하지 못했습니다.');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ASSIGNMENT_RULES_KEY });
      // 방금 저장한 것도 이력에 남는다. 안 비우면 로그를 열었을 때 직전 것이 안 보인다.
      queryClient.invalidateQueries({ queryKey: ASSIGNMENT_RULE_LOGS_KEY });
    },
  });
}
