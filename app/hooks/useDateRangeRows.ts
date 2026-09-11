'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { InsurerAgeSplit } from '@/lib/rangeAges';

/** 보험사별 건수. 보험사를 못 읽은 옛 파일은 etc 로 센다. */
export interface InsurerCount {
  dy: number;
  hk: number;
  etc: number;
}

/** 기간 조회 응답. 표 한 장과 그 표가 어느 파일들에서 왔는지. */
export interface DateRangeRows {
  headers: string[];
  rows: unknown[][];
  /** 자르기 전 전체 행 수 */
  total: number;
  /** 상한을 넘어 앞부분만 온 경우 */
  truncated: boolean;
  /** 기간의 달력 날짜 수(양 끝 포함) */
  days: number;
  /** 하루 평균 건수. 소수 첫째 자리까지 */
  dailyAverage: number;
  /** 소속별 건수, 많은 순. 지사는 자기 소속 하나만 온다 */
  byDepartment: Array<{
    department: string;
    count: number;
    dailyAverage: number;
    byInsurer: InsurerCount;
    /** 보험사 × 나이 구간(70세 미만/이상). 파라인슈만 온다 */
    byAge?: InsurerAgeSplit;
  }>;
  /** 기간 전체의 보험사별 건수 */
  byInsurer: InsurerCount;
  files: Array<{ name: string; uploadedAt: string; department: string | null; count: number }>;
}

/**
 * 두 날짜 사이에 배포된 행들.
 *
 * 조회 버튼을 눌러야 묻는다(enabled). 날짜를 고르는 동안 계속 물으면
 * 고르는 중간값마다 수천 줄이 오간다.
 */
export function useDateRangeRows(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['fileRange', from, to],
    queryFn: async (): Promise<DateRangeRows> => {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/files/range?${params}`, { credentials: 'include' });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || '기간 조회에 실패했습니다.');
      return body as DateRangeRows;
    },
    enabled: enabled && !!from && !!to,
    /*
     * 날짜를 옮기는 동안 앞 결과를 그대로 들고 있는다.
     *
     * 기간이 바뀌면 조회 열쇠가 바뀌어 데이터가 잠깐 빈다. 창은 데이터가
     * 있을 때만 그리므로, 그대로 두면 하루씩 옮길 때마다 창이 닫혔다 다시
     * 열려 깜빡인다. 앞 표를 둔 채 새 표로 갈아 끼운다.
     */
    placeholderData: keepPreviousData,
    // 배포는 하루에 몇 번 없다. 같은 기간을 다시 열면 그대로 보여줘도 된다.
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });
}
