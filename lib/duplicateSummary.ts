import {
  DUP_ORDER_SHEET,
  DUP_ORDER_REASON,
  DUP_CUSTOMER_SHEET,
  DUP_CUSTOMER_REASON,
  DUP_CROSS_PHONE_SHEET,
  DUP_CROSS_PHONE_REASON,
  BLACKLIST_SHEET,
  BLACKLIST_REASON_LISTED,
  BLACKLIST_REASON_NEW,
} from '@/lib/insurance';

/**
 * 중복 미리보기 위에 띄울 한 줄 요약.
 *
 * 총 건수만 보여주면 "무엇 때문에 빠졌나"를 알려면 표를 훑어야 한다.
 * 갈래별 건수를 같이 적어 한눈에 보이게 한다.
 *
 * 시트 이름과 사유 문구는 여기서 짝지어 둔다 — 파일과 화면이 다른 말을 쓰면
 * 사람이 대조할 수 없다.
 */
const GROUPS = [
  { sheet: DUP_ORDER_SHEET, reason: DUP_ORDER_REASON },
  { sheet: DUP_CUSTOMER_SHEET, reason: DUP_CUSTOMER_REASON },
  { sheet: DUP_CROSS_PHONE_SHEET, reason: DUP_CROSS_PHONE_REASON },
  // 블랙리스트는 사유가 둘이다 — 이번에 걸린 것과 예전에 걸려 계속 막히는 것.
  // 배지에는 합쳐서 한 칸으로 보여준다.
  { sheet: BLACKLIST_SHEET, reason: BLACKLIST_REASON_LISTED, alsoStartsWith: BLACKLIST_REASON_NEW },
] as const;

/** 이 사유가 이 갈래에 속하는가. 사유는 각 행의 첫 칸에 들어 있다. */
function matchesGroup(group: (typeof GROUPS)[number], reason: string): boolean {
  if (reason === group.reason) return true;
  // '60일 내 3회 이상 신청 (4회)'처럼 뒤에 횟수가 붙는 사유가 있다.
  return 'alsoStartsWith' in group && reason.startsWith(group.alsoStartsWith);
}

/**
 * 중복 행을 갈래별로 나눈다.
 *
 * 요약 버튼이 갈래마다 자기 목록만 열어야 하므로 건수만으로는 부족하다.
 * 세는 규칙과 나누는 규칙이 갈리면 배지 숫자와 열리는 목록이 안 맞으므로
 * 한 함수에서 갈라 두고 건수는 여기서 뽑아 쓴다.
 *
 * 0건인 갈래도 남긴다 — 빠지면 "안 걸린 건지 규칙이 없는 건지" 알 수 없다.
 */
export function splitDuplicatesByGroup(
  duplicateRows: any[][] | undefined
): Array<{ sheet: string; rows: any[][] }> {
  const rows = duplicateRows ?? [];
  return GROUPS.map((group) => ({
    sheet: group.sheet,
    rows: rows.filter((row) => matchesGroup(group, String(row?.[0] ?? ''))),
  }));
}

/** 사유별 건수. 나누는 규칙과 어긋나지 않게 같은 결과에서 뽑는다. */
export function countDuplicatesByGroup(
  duplicateRows: any[][] | undefined
): Array<{ sheet: string; count: number }> {
  return splitDuplicatesByGroup(duplicateRows).map(({ sheet, rows }) => ({
    sheet,
    count: rows.length,
  }));
}

/**
 * 화면에 띄울 갈래별 건수. 걸린 게 하나도 없으면 빈 배열이다 —
 * 0만 늘어놓아도 읽을 게 없다.
 */
export function toDuplicateBadges(
  duplicateRows: any[][] | undefined
): Array<{ sheet: string; count: number }> {
  const groups = countDuplicatesByGroup(duplicateRows);
  return groups.every((g) => g.count === 0) ? [] : groups;
}

/**
 * 엑셀 파일에서 직접 센 갈래별 건수.
 *
 * 분류 화면은 서버가 준 목록으로 세지만, 이미 배포된 원본 파일을 열어볼 때는
 * 그런 목록이 없다. 그 파일 안에 중복 시트가 이미 들어 있으므로 거기서 센다.
 *
 * @param sheetRowCounts 시트 이름 → 데이터 행 수
 */
export function badgesFromSheets(
  sheetRowCounts: Record<string, number> | undefined
): Array<{ sheet: string; count: number }> {
  if (!sheetRowCounts) return [];

  // 중복 시트가 하나도 없는 파일(배포본, 예전 파일)에는 그릴 게 없다.
  const hasAny = GROUPS.some(({ sheet }) => sheet in sheetRowCounts);
  if (!hasAny) return [];

  return GROUPS.map(({ sheet }) => ({ sheet, count: sheetRowCounts[sheet] ?? 0 }));
}
