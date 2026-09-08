import { ORDER_SHEET_HEADERS } from '@/lib/giftOrderSheet';
import { validateGiftInput, type GiftRequestInput } from '@/lib/gifts';
import { formatPhone } from '@/lib/phoneFormat';

/**
 * 발주리스트 양식의 표를 그대로 붙여넣어 여러 건을 읽어낸다.
 *
 * 지사는 거래처 양식(열 18개)으로 이미 정리해 둔 표를 갖고 있다. 그걸 칸마다
 * 옮겨 적게 하면 붙여넣기의 뜻이 없다 — 표를 통째로 받아 읽는다.
 *
 * 붙여넣기 결과는 어디서 복사했느냐에 따라 두 가지 모양으로 온다:
 *   - 탭으로 나뉜 줄     엑셀에서 복사하면 한 줄에 열여덟 칸이 탭으로 붙어 온다
 *   - 한 칸씩 줄바꿈     웹 표를 복사하면 칸마다 줄이 바뀌고, 칸 사이에 빈 줄이
 *                        끼며, **빈 칸은 전각 공백(　) 한 글자**로 온다
 * 두 번째 모양에서 빈 칸을 버리면 그 뒤 칸이 전부 밀려 엉뚱한 자리에 들어간다.
 * 그래서 "아무것도 없는 줄"(칸 사이의 간격)과 "공백만 있는 줄"(빈 칸)을 가른다.
 *
 * 열 순서는 발주리스트와 같다. 발주일·택배사·운송장번호는 읽되 쓰지 않는다 —
 * 그건 발주 뒤에 담당자가 채우는 값이다. 고객번호가 곧 주문번호다(신규 양식의
 * 고객번호는 표준 양식에서 주문번호 자리에 들어가 있다).
 */

export const GIFT_PASTE_HEADERS = ORDER_SHEET_HEADERS;

export interface GiftPasteRow extends GiftRequestInput {
  /** 붙여넣은 고객명. 저장에는 안 쓰고 기록의 이름과 맞는지 대조하는 데 쓴다. */
  pastedName: string;
  pastedPhone: string;
}

export interface GiftPasteResult {
  rows: GiftPasteRow[];
  /** 읽었지만 그대로는 등록할 수 없는 줄. 몇 번째인지와 이유를 함께 준다. */
  problems: Array<{ at: number; reason: string; row: GiftPasteRow }>;
  /** 열여덟 칸이 안 되어 아예 못 읽은 덩어리 수 */
  skipped: number;
}

const COLS = GIFT_PASTE_HEADERS.length;

/** 줄 끝 정리. 전각 공백·nbsp 까지 뗀다 — 빈 칸 표시로 쓰이는 글자들이다. */
const clean = (v: string) => v.replace(/\r/g, '').replace(/[　 ]/g, ' ').trim();

/** 머리글 칸인가. 값이 아니라 칸 이름이면 건너뛴다. */
function isHeaderCell(value: string): boolean {
  const normalized = clean(value).replace(/\s+/g, '');
  return (GIFT_PASTE_HEADERS as readonly string[]).some((h) => h.replace(/\s+/g, '') === normalized);
}

function toRow(cells: string[]): GiftPasteRow {
  const c = cells.map(clean);
  // 열 순서: 발주일 택배사 운송장번호 고객명 전화번호1 전화번호2 우편번호 주소 배송메세지
  //          사은품명 수량 비고 보내시는분 보내시는분연락처 상품명 고객번호 상담원 정산구분
  const quantity = Number(c[10]);
  return {
    // 고객번호가 곧 주문번호. 배포 기록을 이걸로 찾는다.
    orderNo: c[15],
    pastedName: c[3],
    pastedPhone: formatPhone(c[4]),
    zip: c[6],
    address: c[7],
    deliveryMemo: c[8],
    giftName: c[9],
    quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : c[10] === '' ? 1 : quantity,
    note: c[11],
    senderName: c[12],
    senderPhone: formatPhone(c[13]),
    product: c[14],
    customerNo: c[15],
    counselor: c[16],
    settlement: c[17],
  };
}

/**
 * 붙여넣은 글을 칸 묶음 목록으로.
 */
/** 이 줄이 통째로 머리글인가 — 탭으로 붙은 열 이름들이거나 열 이름 하나. */
function isHeaderLine(line: string): boolean {
  const cells = line.split('\t').map(clean).filter((c) => c.length > 0);
  return cells.length > 0 && cells.every(isHeaderCell);
}

function toCellGroups(text: string): string[][] {
  /*
   * 머리글부터 걷어낸다. 웹 표를 복사하면 머리글은 탭으로 붙은 한 줄로 오고
   * 본문은 한 칸씩 줄바꿈으로 온다 — 머리글의 탭을 보고 전체를 "탭 모양"으로
   * 읽으면 본문이 한 칸짜리 조각으로 부서진다. 머리글을 뺀 뒤에 모양을 정한다.
   */
  const rawLines = text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => !isHeaderLine(line));

  // 탭이 하나라도 있으면 '한 줄에 열여덟 칸' 모양이다.
  if (rawLines.some((line) => line.includes('\t'))) {
    return rawLines
      .map((line) => line.split('\t').map(clean))
      .filter((cells) => cells.some((c) => c.length > 0));
  }

  /*
   * 한 칸씩 줄바꿈된 모양.
   *
   * 아무것도 없는 줄은 칸 사이의 간격이라 버리고, 공백만 있는 줄(전각 공백 등)은
   * 빈 칸이라 남긴다. 둘을 같이 버리면 빈 칸 뒤의 값이 전부 앞으로 밀린다.
   */
  const lines = rawLines.filter((line) => line.length > 0).map(clean);
  if (lines.length === 0) return [];

  // 머리글 열여덟 줄이 앞에 붙어 있으면 걷어낸다.
  const start = lines.slice(0, COLS).every(isHeaderCell) ? COLS : 0;

  const groups: string[][] = [];
  for (let at = start; at < lines.length; at += COLS) {
    groups.push(lines.slice(at, at + COLS));
  }
  return groups;
}

/**
 * @returns 읽은 줄, 문제가 있는 줄, 못 읽고 버린 덩어리 수
 */
export function parseGiftPaste(text: string): GiftPasteResult {
  const groups = toCellGroups(text);

  const rows: GiftPasteRow[] = [];
  const problems: GiftPasteResult['problems'] = [];
  let skipped = 0;

  for (const cells of groups) {
    if (cells.filter((c) => c.length > 0).length === 0) continue;
    // 칸이 모자라면 읽을 수 없다. 억지로 채우면 값이 밀려 엉뚱한 칸에 들어간다.
    if (cells.length < COLS) {
      skipped++;
      continue;
    }

    const row = toRow(cells);
    rows.push(row);

    // 등록할 때와 같은 함수로 미리 본다 — 눌러 보고 나서 알게 되면 늦다.
    const error = validateGiftInput(row as unknown as Record<string, unknown>);
    if (error) problems.push({ at: rows.length, reason: error, row });
  }

  return { rows, problems, skipped };
}

/* ── 발주처가 채워 돌려준 표 ──────────────────────────────────── */

/**
 * 발주처에 보낸 발주리스트는 **발주일·택배사·운송장번호(·배송메세지)가 채워져**
 * 돌아온다. 그 표를 그대로 붙여넣어 우리 건에 옮겨 적는다 — 열두 건이면 열두 번
 * 창을 열어 송장을 치던 일이다.
 *
 * 열 순서는 보낼 때와 같다(18열). 우리가 쓰는 것은 앞 세 칸과 배송메세지,
 * 그리고 **고객번호** — 그게 우리 신청을 찾는 열쇠다.
 *
 * 발주처 파일에는 다른 회사 건이 섞여 있을 수 있다. 고객번호가 우리 것과 안
 * 맞으면 그 줄은 조용히 건너뛴다 — 오류가 아니라 남의 줄이다.
 */
export interface ShipPasteRow {
  /** 고객번호 = 우리 주문번호. 이걸로 신청을 찾는다. */
  orderNo: string;
  customerName: string;
  giftName: string;
  quantity: number;
  /** YYYY-MM-DD로 고른 발주일. 못 읽으면 빈 값 — 그때는 안 건드린다. */
  orderDate: string;
  courier: string;
  trackingNo: string;
  deliveryMemo: string;
}

export interface ShipPasteResult {
  rows: ShipPasteRow[];
  /** 고객번호가 없거나 채울 것이 없어 아예 못 쓰는 줄 수. */
  skipped: number;
}

/** 이 줄에 채울 것이 있는가. 택배사도 운송장도 없으면 아직 안 온 줄이다. */
export const shipRowHasInfo = (row: ShipPasteRow): boolean =>
  !!(row.courier || row.trackingNo);

/**
 * 붙여넣은 날짜를 YYYY-MM-DD로.
 *
 * 엑셀에서 복사하면 서식대로 온다 — `2026-09-08`·`2026. 9. 8`·`9/8/2026`.
 * 못 읽으면 빈 값이다. 억지로 오늘로 때우면 발주일이 조용히 틀린다.
 */
export function normalizeShipDate(value: string): string {
  const text = clean(value);
  if (!text) return '';
  const nums = text.match(/\d+/g);
  if (!nums || nums.length < 3) return '';
  let [a, b, c] = nums.slice(0, 3).map(Number);
  // 4자리가 앞에 있으면 연-월-일, 뒤에 있으면 월/일/연(미국식 서식).
  if (String(nums[0]).length !== 4) {
    if (String(nums[2]).length !== 4) return '';
    [a, b, c] = [c, a, b];
  }
  if (b < 1 || b > 12 || c < 1 || c > 31) return '';
  const at = new Date(a, b - 1, c);
  if (at.getFullYear() !== a || at.getMonth() !== b - 1 || at.getDate() !== c) return '';
  return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
}

export function parseShipPaste(text: string): ShipPasteResult {
  const groups = toCellGroups(text);
  const rows: ShipPasteRow[] = [];
  let skipped = 0;

  for (const cells of groups) {
    if (cells.filter((c) => c.length > 0).length === 0) continue;
    if (cells.length < COLS) {
      skipped++;
      continue;
    }
    const c = cells.map(clean);
    const row: ShipPasteRow = {
      orderNo: c[15],
      customerName: c[3],
      giftName: c[9],
      quantity: Number(c[10]) || 1,
      orderDate: normalizeShipDate(c[0]),
      courier: c[1],
      trackingNo: c[2],
      deliveryMemo: c[8],
    };
    // 찾을 열쇠가 없거나 채울 것이 없으면 쓸모가 없다.
    if (!row.orderNo || !shipRowHasInfo(row)) {
      skipped++;
      continue;
    }
    rows.push(row);
  }

  return { rows, skipped };
}
