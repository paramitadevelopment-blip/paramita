import { SELECTABLE_REGIONS, type SelectableRegion } from '@/lib/insurance';

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
  pendingKeysByRegion?: Partial<Record<SelectableRegion, string[]>>;
  /** 지역 → 그 지역에서 골라야 하는 행들 (키와 같은 순서) */
  pendingRowsByRegion?: Partial<Record<SelectableRegion, any[][]>>;
  previewHeaders?: string[];
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

  for (const region of SELECTABLE_REGIONS) {
    const rows = file.pendingRowsByRegion?.[region] ?? [];
    const keys = file.pendingKeysByRegion?.[region] ?? [];
    keys.forEach((key, i) => {
      const dept = picks?.[key];
      if (!dept) return;
      (addedRows[dept] ??= []).push(rows[i]);
    });
  }

  return addedRows;
}

/**
 * 좁게 눌러도 되는 열. tel1은 tel2와 같은 번호라 앞자리만 보이면 충분하다.
 * 이 열이 넓게 자리를 차지하면 정작 골라야 할 '배정 소속'이 밀려 잘린다.
 */
export function findNarrowCols(headers: string[] | undefined): Set<number> {
  const set = new Set<number>();
  (headers ?? []).forEach((header, i) => {
    if (/^tel\s*1$/i.test(String(header).trim())) set.add(i);
  });
  return set;
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
): Array<{ fileName: string; region: SelectableRegion }> {
  return files.flatMap((file, fileIdx) =>
    SELECTABLE_REGIONS.flatMap((region) =>
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
