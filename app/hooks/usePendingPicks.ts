'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  SELECTABLE_REGIONS,
  autoDistributePending,
  type PendingEntry,
} from '@/lib/insurance';
import { collectAddedRows, findNarrowCols, findUnpicked } from '@/lib/pendingPicks';
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
  // 선택 방식 탭. 파일마다 따로 기억한다 — 한 파일에서 자동으로 채웠다고
  // 다음 파일까지 자동으로 바뀌면 확인 없이 배포될 수 있다.
  const [pickMode, setPickMode] = useState<Record<number, 'manual' | 'auto'>>({});
  /** 선택 대기 표의 정렬. 'region'이거나 미리보기 열의 인덱스다. */
  const [pendingSort, setPendingSort] = useState<{ by: 'region' | number; order: 'asc' | 'desc' }>({
    by: 'region',
    order: 'asc',
  });

  const current: ClassifiedFile | null = classifiedFiles[currentIndex] ?? null;

  // 분류를 새로 돌리면 앞 결과의 선택이 남지 않게 비운다. 선택은 파일 순서로
  // 매겨 두는데 결과가 바뀌면 그 번호가 다른 파일을 가리키게 된다.
  // 비울 게 없으면 같은 참조를 그대로 돌려준다 — 새 객체를 주면 리렌더만 한 번 더 돈다.
  useEffect(() => {
    setRowPicks((prev) => (Object.keys(prev).length > 0 ? {} : prev));
    setPickMode((prev) => (Object.keys(prev).length > 0 ? {} : prev));
  }, [classifiedFiles]);

  /**
   * 자동 배분. 규칙으로 이미 배정된 수를 이어받아, 갈 수 있는 소속 중
   * 가장 적게 받은 곳부터 채운다. 강원 건은 갈 곳이 둘뿐이라 먼저 넣는다.
   * 채워진 값은 그대로 고칠 수 있다 — 자동은 출발점일 뿐이다.
   */
  const applyAutoDistribute = (fileIdx: number) => {
    const file = classifiedFiles[fileIdx];
    if (!file) return;

    const pending: PendingEntry[] = SELECTABLE_REGIONS.flatMap((region) => {
      const keys = file.pendingKeysByRegion?.[region] ?? [];
      const jumins = file.pendingJuminByRegion?.[region] ?? [];
      return keys.map((key, i) => ({ key, region, jumin: jumins[i] ?? '' }));
    });

    // 규칙으로 이미 들어간 수. 소속ID가 아니라 이름으로 세야 배분 대상과 맞는다.
    const baseCounts: Record<string, number> = {};
    for (const [dept, count] of Object.entries(file.classification ?? {})) {
      baseCounts[dept] = count;
    }

    const picks = autoDistributePending(pending, baseCounts);
    setRowPicks((prev) => ({ ...prev, [fileIdx]: picks }));
  };

  const handlePickMode = (fileIdx: number, mode: 'manual' | 'auto') => {
    setPickMode((prev) => ({ ...prev, [fileIdx]: mode }));
    if (mode === 'auto') {
      applyAutoDistribute(fileIdx);
    } else {
      // 직접 고르는 탭으로 오면 빈 상태에서 시작한다. 자동으로 채운 값이 남아 있으면
      // 사람이 고른 것인지 자동인지 구분되지 않는다.
      setRowPicks((prev) => ({ ...prev, [fileIdx]: {} }));
    }
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

  const narrowCols = useMemo(() => findNarrowCols(current?.previewHeaders), [current]);

  const unpicked = findUnpicked(classifiedFiles, rowPicks);

  return {
    rowPicks,
    pickMode,
    pendingSort,
    resultWithPicks,
    narrowCols,
    unpicked,
    handlePickMode,
    handlePickRow,
    togglePendingSort,
  };
}
