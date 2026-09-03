import { REGIONS, type Region } from '@/lib/assignmentRegions';

/**
 * 사람이 소속을 골라야 하는 건들을 다루는 계산.
 *
 * 화면에 매인 코드가 아니라 순수 계산이라 lib에 둔다 — 데이터만 넣으면
 * 결과가 정해지므로 화면을 띄우지 않고도 검증할 수 있다.
 */

/** 계산에 필요한 만큼만 추린 분류 결과. 훅의 ClassifiedFile이 이 모양을 만족한다. */
export interface PickableFile {
  fileName: string;
  /** 지역 → 그 지역에서 골라야 하는 행들의 키 (주문번호) */
  pendingKeysByRegion?: Partial<Record<Region, string[]>>;
  /** 지역 → 그 지역에서 골라야 하는 행들 (키와 같은 순서) */
  pendingRowsByRegion?: Partial<Record<Region, any[][]>>;
  /** 규칙이 이미 정한 건들. 화면에서 다른 소속으로 바꿀 수 있다 */
  assignedRows?: AssignedRow[];
  previewHeaders?: string[];
}

/**
 * 이 건이 표에 왜 올라와 있는가.
 *
 * 'assigned'는 규칙이 이미 정한 건이다. 고를 필요는 없지만, 규칙과 다르게
 * 보내야 할 때가 있어 같은 표에서 바꿀 수 있게 함께 보여준다.
 */
export type PendingReason = 'assigned' | 'multiple' | 'unmatched';

/**
 * 지금 보고 있는 범위. 자동선택·직접선택·일괄배정이 모두 여기에만 걸린다.
 *
 * 지역과 사유를 따로 좁힌다 — "담당 지사가 없는 건"은 한꺼번에 한 곳으로
 * 몰아주는 일이 많고, "지사가 겹친 건"은 나눠 담는 일이 많아 손이 다르다.
 * 섞여 있으면 한 건씩 눌러 가며 골라내야 한다.
 */
export interface PickScope {
  region: Region | 'all';
  reason: PendingReason | 'all';
}

/** 아무것도 안 좁힌 기본 범위 */
export const ALL_SCOPE: PickScope = { region: 'all', reason: 'all' };

/** 상태 저장·비교에 쓰는 문자열 키 */
export function scopeKey(scope: PickScope): string {
  return `${scope.region}|${scope.reason}`;
}

/** 같은 지역·이유·후보끼리 묶은 한 덩어리 */
export interface PendingReasonGroup {
  /** 주소를 못 읽은 자동분류 건은 지역이 없다 */
  region: Region | null;
  reason: PendingReason;
  /** 고를 수 있는 소속들 */
  choices: string[];
  count: number;
}

/**
 * 건들이 왜 직접분류로 넘어왔는지 묶어서 설명한다.
 *
 * 지역을 묶음 기준에 넣는다. 전체 탭에서는 여러 지역이 섞이는데 사유만
 * 늘어놓으면 어느 지역 이야기인지 알 수가 없다.
 *
 * 건수가 많은 순으로 준다 — 화면 위쪽에 대표적인 사정이 먼저 온다.
 */
export function summarizePendingReasons(
  file: SummarizableFile | null,
  scope: PickScope
): PendingReasonGroup[] {
  if (!file) return [];

  const groups = new Map<string, PendingReasonGroup>();

  for (const { region, reason, choices } of rowsInScope(file, scope)) {
    const key = `${region}|${reason}|${choices.join(',')}`;
    const found = groups.get(key);
    if (found) found.count += 1;
    else groups.set(key, { region, reason, choices, count: 1 });
  }

  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/** 범위 계산이 보는 만큼만 추린 모양 */
export interface SummarizableFile {
  pendingKeysByRegion?: Partial<Record<Region, string[]>>;
  pendingReasonsByRegion?: Partial<Record<Region, string[]>>;
  pendingChoicesByRegion?: Partial<Record<Region, string[][]>>;
  /** 규칙이 이미 정한 건들 */
  assignedRows?: AssignedRow[];
  /** 규칙이 정한 건을 바꿀 때 고를 수 있는 소속 전부 */
  assignableDepts?: string[];
}

/** 규칙이 이미 정한 한 건 */
export interface AssignedRow {
  key: string;
  /** 주소를 못 읽었으면 null */
  region: Region | null;
  dept: string;
  row: any[];
}

/**
 * 이 범위에 드는 지역들.
 *
 * 지역 탭을 보고 있을 때 누른 자동선택은 그 탭에만 걸려야 한다 —
 * 전 지역을 건드리면 다른 탭에서 손으로 고른 것까지 덮어써 놓고
 * 화면에는 그 탭만 보여 준다. 무엇이 바뀌었는지 알 방법이 없다.
 */
export function regionsInScope(scope: PickScope): readonly Region[] {
  return scope.region === 'all' ? REGIONS : [scope.region];
}

/** 범위에 드는 한 건 */
export interface ScopedRow {
  key: string;
  /** 주소를 못 읽은 자동분류 건은 지역이 없다 */
  region: Region | null;
  reason: PendingReason;
  choices: string[];
  /** 규칙이 정한 소속. 자동분류 건에만 있다 */
  assignedDept?: string;
}

/**
 * 이 범위에 드는 건들. 지역과 사유를 모두 만족해야 한다.
 *
 * 사유가 안 실려 온 파일(예전 응답)은 사유로 거르지 않는다 —
 * 걸러 버리면 고를 건이 통째로 사라져 배포가 막힌다.
 */
export function rowsInScope(file: SummarizableFile | null, scope: PickScope): ScopedRow[] {
  if (!file) return [];

  const rows: ScopedRow[] = [];

  /*
   * 규칙이 이미 정한 건들. 고를 필요는 없지만 규칙과 다르게 보내야 할 때가
   * 있어 같은 표에서 바꿀 수 있게 한다. 바꿀 때 고를 수 있는 곳은 그 행의
   * 후보가 아니라 배정 가능한 소속 전부다 — 규칙 밖으로 옮기는 일이니까.
   */
  if (scope.reason === 'all' || scope.reason === 'assigned') {
    for (const entry of file.assignedRows ?? []) {
      if (scope.region !== 'all' && entry.region !== scope.region) continue;
      rows.push({
        key: entry.key,
        region: entry.region,
        reason: 'assigned',
        choices: file.assignableDepts ?? [],
        assignedDept: entry.dept,
      });
    }
  }

  for (const region of regionsInScope(scope)) {
    const keys = file.pendingKeysByRegion?.[region] ?? [];
    const reasons = file.pendingReasonsByRegion?.[region] ?? [];
    const choices = file.pendingChoicesByRegion?.[region] ?? [];

    keys.forEach((key, i) => {
      const reason = (reasons[i] ?? 'unmatched') as PendingReason;
      if (scope.reason !== 'all' && reasons[i] !== undefined && reason !== scope.reason) return;
      rows.push({ key, region, reason, choices: choices[i] ?? [] });
    });
  }

  return rows;
}

/** 이 범위에서 골라야 하는 행들의 키. */
export function keysInScope(file: SummarizableFile | null, scope: PickScope): Set<string> {
  return new Set(rowsInScope(file, scope).map((r) => r.key));
}

/**
 * 범위 안의 건들을 한 소속으로 몰아준다.
 *
 * 그 소속으로 갈 수 없는 건(후보에 없는 건)은 건드리지 않는다 —
 * 배포가 소속명으로 파일을 만들기 때문에, 못 가는 곳에 넣으면
 * 그 건은 아무 파일에도 안 담기고 조용히 사라진다.
 *
 * @returns 실제로 배정된 건들 (주문번호 → 소속명)
 */
export function pickAllInScope(
  file: SummarizableFile | null,
  scope: PickScope,
  dept: string
): Record<string, string> {
  const picks: Record<string, string> = {};

  for (const row of rowsInScope(file, scope)) {
    if (!row.choices.includes(dept)) continue;
    picks[row.key] = dept;
  }
  return picks;
}

/**
 * 범위 안의 건들이 공통으로 갈 수 있는 소속.
 * 일괄배정 목록에 쓴다 — 일부만 갈 수 있는 곳을 내놓으면
 * 눌러 놓고도 몇 건이 왜 안 채워졌는지 알 수 없다.
 */
export function commonChoicesInScope(
  file: SummarizableFile | null,
  scope: PickScope
): string[] {
  const rows = rowsInScope(file, scope);
  if (rows.length === 0) return [];

  return rows
    .slice(1)
    .reduce<string[]>(
      (common, row) => common.filter((dept) => row.choices.includes(dept)),
      [...rows[0].choices]
    );
}

/**
 * 자동 배분의 출발점이 될 소속별 건수.
 *
 * 규칙이 이미 배정한 수에, 이번 범위 밖에서 사람이 골라 둔 건을 더한다.
 * 이걸 빼먹으면 지역별로 나눠 돌릴 때마다 매번 0에서 시작해, 앞 탭에서
 * 이미 많이 받은 소속에 또 몰아준다.
 *
 * @param ruleCounts 규칙으로 배정된 소속별 건수
 * @param picks      지금까지 고른 것 (주문번호 → 소속명)
 * @param scopeKeys  이번에 다시 채울 키들. 여기 드는 건 세지 않는다
 */
export function buildBaseCounts(
  ruleCounts: Record<string, number> | undefined,
  picks: Record<string, string> | undefined,
  scopeKeys: Set<string>
): Record<string, number> {
  const counts: Record<string, number> = { ...(ruleCounts ?? {}) };

  for (const [key, dept] of Object.entries(picks ?? {})) {
    if (scopeKeys.has(key)) continue;
    counts[dept] = (counts[dept] ?? 0) + 1;
  }
  return counts;
}

/**
 * 범위 안의 선택만 지운다. 다른 지역 탭에서 고른 것은 그대로 둔다.
 */
export function clearPicksInScope(
  picks: Record<string, string> | undefined,
  scopeKeys: Set<string>
): Record<string, string> {
  const next: Record<string, string> = {};

  for (const [key, dept] of Object.entries(picks ?? {})) {
    if (scopeKeys.has(key)) continue;
    next[key] = dept;
  }
  return next;
}

/** 파일 순서 → (주문번호 → 소속명) */
export type RowPicks = Record<number, Record<string, string>>;

/**
 * 지금 고른 것까지 반영한 소속별 행 목록.
 *
 * 규칙 배정 그리드는 규칙이 정한 것만 보여준다. 사람이 고른 건이 어디로 몇 건 가는지는
 * 배포하기 전에는 알 수 없어서, 고르는 도중에 실시간으로 같이 보여준다.
 */
export function collectAddedRows(
  file: PickableFile | null,
  picks: Record<string, string> | undefined
): Record<string, any[][]> | null {
  if (!file) return null;

  // 소속명 → 선택으로 추가된 행들
  const addedRows: Record<string, any[][]> = {};

  for (const region of REGIONS) {
    const rows = file.pendingRowsByRegion?.[region] ?? [];
    const keys = file.pendingKeysByRegion?.[region] ?? [];
    keys.forEach((key, i) => {
      const dept = picks?.[key];
      if (!dept) return;
      (addedRows[dept] ??= []).push(rows[i]);
    });
  }

  /*
   * 규칙이 정한 건을 다른 소속으로 옮긴 것도 반영한다.
   * 이걸 빼면 '선택 반영' 숫자가 규칙 배정 그대로여서, 옮겨 놓고도
   * 배포 전에는 몇 건이 어디로 가는지 알 수가 없다.
   */
  for (const entry of file.assignedRows ?? []) {
    const dept = picks?.[entry.key];
    if (!dept || dept === entry.dept) continue;
    (addedRows[dept] ??= []).push(entry.row);
  }

  return addedRows;
}

/**
 * 아직 소속을 안 고른 건들. 하나라도 남으면 배포를 막는다 —
 * 그냥 내보내면 그 건들이 아무 부서에도 안 가고 조용히 사라진다.
 *
 * 보고 있는 파일뿐 아니라 전체 파일을 봐야 한다. 다른 페이지에 남은 건이
 * 있는데도 배포 버튼이 열리면 그 건들이 소리 없이 빠진다.
 */
export function findUnpicked(
  files: PickableFile[],
  rowPicks: RowPicks
): Array<{ fileName: string; region: Region }> {
  return files.flatMap((file, fileIdx) =>
    REGIONS.flatMap((region) =>
      (file.pendingKeysByRegion?.[region] ?? [])
        .filter((key) => !rowPicks[fileIdx]?.[key])
        .map(() => ({ fileName: file.fileName, region }))
    )
  );
}

/**
 * 배포 요청에 실을 선택 목록. 파일 순서와 1:1로 맞춘 배열을 만든다.
 *
 * 파일명으로 맞추면 같은 이름이 여러 개일 때 엉킨다. 고른 게 없는 파일도
 * 빈 칸으로 자리를 채워야 서버가 세는 순서와 어긋나지 않는다.
 */
export function buildRowAssignments(
  fileCount: number,
  rowPicks: RowPicks
): Array<Record<string, string>> {
  return Array.from({ length: fileCount }, (_, i) => rowPicks[i] ?? {});
}
