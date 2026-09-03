'use client';

import { useEffect, useMemo, useState } from 'react';
import { autoDistributePending, type PendingEntry } from '@/lib/insurance';
import { type Region } from '@/lib/assignmentRegions';
import {
  buildBaseCounts,
  clearPicksInScope,
  collectAddedRows,
  findUnpicked,
  keysInScope,
  pickAllInScope,
  rowsInScope,
  scopeKey,
  type PendingReason,
  type PickScope,
} from '@/lib/pendingPicks';
import type { ClassifiedFile } from '@/app/hooks/useAutoClassify';

/**
 * 사람이 소속을 골라야 하는 건들의 상태.
 *
 * 분류 결과 모달이 한 파일씩 넘겨 가며 쓰므로 파일 순서(fileIdx)로 갈라 담는다.
 * 행을 가리키는 건 화면 위치가 아니라 주문번호다 — 화면은 지역별로 묶어 보여주고
 * 배포는 파일 행 순서로 도는데, 위치 번호로 주고받으면 선택이 엉뚱한 사람에게 붙는다.
 */
export function usePendingPicks(classifiedFiles: ClassifiedFile[], currentIndex: number) {
  /** 파일 순서 → (주문번호 → 소속명) */
  const [rowPicks, setRowPicks] = useState<Record<number, Record<string, string>>>({});
  /**
   * 선택 방식 탭. 파일마다, 그 안에서 지역 탭마다 따로 기억한다.
   *
   * 파일마다 나누는 이유 — 한 파일에서 자동으로 채웠다고 다음 파일까지
   * 자동으로 바뀌면 확인 없이 배포될 수 있다.
   * 지역마다 나누는 이유 — 경기남부에서 자동선택을 눌렀는데 서울 탭도
   * '자동선택'으로 보이면, 서울은 비어 있는데 채워진 줄 안다.
   */
  const [pickMode, setPickMode] = useState<Record<number, Record<string, 'manual' | 'auto'>>>({});
  /** 선택 대기 표의 정렬. 'region'이거나 미리보기 열의 인덱스다. */
  const [pendingSort, setPendingSort] = useState<{ by: 'region' | number; order: 'asc' | 'desc' }>({
    by: 'region',
    order: 'asc',
  });
  /**
   * 보고 있는 지역 탭. 'all'이면 전부 한 표에 보여준다.
   *
   * 파일마다 따로 기억한다 — 한 파일에서 서울 탭을 보고 있었다고 다음 파일도
   * 서울로 열리면, 그 파일에 서울 건이 없을 때 빈 표를 보고 다 골랐다고 여긴다.
   */
  const [regionTab, setRegionTab] = useState<Record<number, Region | 'all'>>({});
  /**
   * 보고 있는 사유 필터. 'all'이면 사유로 안 거른다.
   *
   * 지사가 겹친 건과 담당 지사가 없는 건은 손이 다르다 — 겹친 건은 나눠 담고,
   * 없는 건은 한 곳으로 몰아주는 일이 많다. 섞어 두면 한 건씩 눌러 골라내야 한다.
   */
  const [reasonTab, setReasonTab] = useState<Record<number, PendingReason | 'all'>>({});

  const current: ClassifiedFile | null = classifiedFiles[currentIndex] ?? null;

  // 분류를 새로 돌리면 앞 결과의 선택이 남지 않게 비운다. 선택은 파일 순서로
  // 매겨 두는데 결과가 바뀌면 그 번호가 다른 파일을 가리키게 된다.
  // 비울 게 없으면 같은 참조를 그대로 돌려준다 — 새 객체를 주면 리렌더만 한 번 더 돈다.
  useEffect(() => {
    setRowPicks((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    setPickMode((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    setRegionTab((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    setReasonTab((prev) => (Object.keys(prev).length > 0 ? {} : prev));
  }, [classifiedFiles]);

  /**
   * 자동 배분. 규칙으로 이미 배정된 수를 이어받아, 갈 수 있는 소속 중
   * 가장 적게 받은 곳부터 채운다. 갈 곳이 적은 건부터 넣는다.
   * 채워진 값은 그대로 고칠 수 있다 — 자동은 출발점일 뿐이다.
   *
   * 보고 있는 지역 탭에만 걸린다. 전체 탭이면 전 지역이 대상이다.
   */
  const applyAutoDistribute = (fileIdx: number, scope: PickScope) => {
    const file = classifiedFiles[fileIdx];
    if (!file) return;

    /*
     * 규칙이 이미 정한 건은 자동 배분에서 뺀다.
     *
     * 자동선택은 "아직 안 정해진 건을 고르게 나눠 주는" 기능이다. 규칙이 정한
     * 건까지 섞으면 눌렀을 때 지역 설정대로 간 건들이 통째로 재배분돼,
     * 정작 규칙을 왜 만들었는지 알 수 없게 된다. 그 건들은 표에서 한 줄씩
     * 바꾸거나 일괄배정으로 옮긴다.
     *
     * 갈 수 있는 곳은 행마다 다르다 — 같은 지역이라도 나이 구간이 다르면 달라진다.
     * 생년월일은 자동 배분의 순서 기준이라 지역별 배열에서 같은 자리를 찾아 붙인다.
     */
    const pending: PendingEntry[] = rowsInScope(file, scope)
      .filter((row): row is typeof row & { region: Region } =>
        row.reason !== 'assigned' && row.region !== null
      )
      .map((row) => {
        const at = (file.pendingKeysByRegion?.[row.region] ?? []).indexOf(row.key);
        return {
          key: row.key,
          region: row.region,
          jumin: (file.pendingJuminByRegion?.[row.region] ?? [])[at] ?? '',
          choices: row.choices,
        };
      });

    setRowPicks((prev) => {
      const before = prev[fileIdx] ?? {};
      // 규칙으로 들어간 수 + 이번 범위 밖에서 이미 고른 수.
      // 소속ID가 아니라 이름으로 세야 배분 대상과 맞는다.
      const baseCounts = buildBaseCounts(
        file.classification,
        before,
        keysInScope(file, scope)
      );

      // 범위 밖 선택은 그대로 두고 이번 것만 덮어쓴다.
      return { ...prev, [fileIdx]: { ...before, ...autoDistributePending(pending, baseCounts) } };
    });
  };

  const handlePickMode = (fileIdx: number, mode: 'manual' | 'auto', scope: PickScope) => {
    setPickMode((prev) => ({
      ...prev,
      [fileIdx]: { ...(prev[fileIdx] ?? {}), [scopeKey(scope)]: mode },
    }));

    if (mode === 'auto') {
      applyAutoDistribute(fileIdx, scope);
      return;
    }

    // 직접 고르는 탭으로 오면 빈 상태에서 시작한다. 자동으로 채운 값이 남아 있으면
    // 사람이 고른 것인지 자동인지 구분되지 않는다. 다른 지역 탭은 건드리지 않는다.
    const scopeKeys = keysInScope(classifiedFiles[fileIdx] ?? null, scope);
    setRowPicks((prev) => ({
      ...prev,
      [fileIdx]: clearPicksInScope(prev[fileIdx], scopeKeys),
    }));
  };

  const handlePickRow = (key: string, dept: string) => {
    setRowPicks((prev) => ({
      ...prev,
      [currentIndex]: { ...(prev[currentIndex] ?? {}), [key]: dept },
    }));
  };

  const togglePendingSort = (by: 'region' | number) => {
    setPendingSort((prev) =>
      prev.by === by
        ? { by, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { by, order: 'asc' }
    );
  };

  // 아래 셋은 순수 계산이라 lib에 두고 여기서는 기억만 한다.
  const resultWithPicks = useMemo(
    () => collectAddedRows(current, rowPicks[currentIndex]),
    [current, rowPicks, currentIndex]
  );

  const unpicked = findUnpicked(classifiedFiles, rowPicks);

  const handleRegionTab = (fileIdx: number, region: Region | 'all') => {
    setRegionTab((prev) => ({ ...prev, [fileIdx]: region }));
  };

  const handleReasonTab = (fileIdx: number, reason: PendingReason | 'all') => {
    setReasonTab((prev) => ({ ...prev, [fileIdx]: reason }));
  };

  /**
   * 지금 보고 있는 범위의 건들을 한 소속으로 몰아준다.
   * 그 소속으로 갈 수 없는 건은 그대로 둔다.
   */
  const handlePickAll = (fileIdx: number, scope: PickScope, dept: string) => {
    const file = classifiedFiles[fileIdx];
    if (!file || !dept) return;

    setRowPicks((prev) => ({
      ...prev,
      [fileIdx]: { ...(prev[fileIdx] ?? {}), ...pickAllInScope(file, scope, dept) },
    }));
  };

  return {
    rowPicks,
    pickMode,
    pendingSort,
    regionTab,
    handleRegionTab,
    reasonTab,
    handleReasonTab,
    handlePickAll,
    resultWithPicks,
    unpicked,
    handlePickMode,
    handlePickRow,
    togglePendingSort,
  };
}
