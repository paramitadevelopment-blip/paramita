import { validateComplaintInput } from '@/lib/complaints';
import { formatPhone } from '@/lib/phoneFormat';

/**
 * 메일에서 복사한 표를 그대로 붙여넣어 읽어낸다.
 *
 * 사람이 여덟 칸을 하나씩 옮겨 적는 대신 표를 통째로 붙여넣게 한다. 하루에
 * 수십 건이 오면 옮겨 적는 것 자체가 일이고, 옮기다 틀리는 것도 거기서 나온다.
 *
 * 붙여넣기 결과는 어디서 복사했느냐에 따라 두 가지 모양으로 온다:
 *   - 탭으로 나뉜 줄     엑셀·표에서 복사하면 한 줄에 여덟 칸이 탭으로 붙어 온다
 *   - 한 칸씩 줄바꿈     웹 화면의 표를 복사하면 칸마다 줄이 바뀐다
 * 사람은 둘을 구분하지 않으므로 여기서 알아서 가른다.
 */

/** 메일 표의 칸 순서. 이 순서로 읽는다. */
export const PASTE_HEADERS = [
  '주문 대표상품',
  '수령인 이름',
  '전화번호2',
  '접수일자',
  '발주확인일',
  '통화내역',
  '주문번호',
  '통화일시',
] as const;

export interface PasteRow {
  product: string;
  customerName: string;
  phone: string;
  receivedAt: string;
  orderConfirmedAt: string;
  callMemo: string;
  orderNo: string;
  calledAt: string;
}

export interface PasteResult {
  rows: PasteRow[];
  /** 읽었지만 그대로는 등록할 수 없는 줄. 몇 번째인지와 이유를 함께 준다. */
  problems: Array<{ at: number; reason: string; row: PasteRow }>;
  /** 여덟 칸이 안 되어 아예 못 읽은 덩어리 수 */
  skipped: number;
}

/** 줄 끝 정리. 전각 공백·nbsp 까지 뗀다 — 빈 칸 표시로 쓰이는 글자들이다. */
const clean = (v: string) => v.replace(/\r/g, '').replace(/[　 ]/g, ' ').trim();

/** 머리글 줄인가. 값이 아니라 칸 이름이면 건너뛴다. */
function isHeaderCell(value: string): boolean {
  const normalized = clean(value).replace(/\s+/g, '');
  return PASTE_HEADERS.some((h) => h.replace(/\s+/g, '') === normalized);
}

/** 이 줄이 통째로 머리글인가 — 탭으로 붙은 칸 이름들. */
function isHeaderLine(line: string): boolean {
  const cells = line.split('\t').map(clean).filter((c) => c.length > 0);
  return cells.length > 0 && cells.every(isHeaderCell);
}

/** 이 칸 묶음이 통째로 머리글인가. 빈 칸은 상관없다. */
function isHeaderGroup(cells: string[]): boolean {
  const filled = cells.map(clean).filter((c) => c.length > 0);
  return filled.length > 0 && filled.every(isHeaderCell);
}

/**
 * 날짜 칸을 화면 입력 칸이 받는 모양으로.
 *
 * 메일마다 2026-07-08 · 2026.07.08 · 2026/07/08 이 섞여 온다. 사람이 고치게
 * 하면 붙여넣는 의미가 없으므로 여기서 맞춘다.
 */
function toDateValue(raw: string): string {
  const text = clean(raw).replace(/[./]/g, '-');
  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return clean(raw);
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** 통화일시. 'YYYY-MM-DD HH:mm[:ss]' → 'YYYY-MM-DDTHH:mm' */
function toDateTimeValue(raw: string): string {
  const text = clean(raw).replace(/[./]/g, '-');
  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})/);
  if (!m) {
    // 시각이 없으면 날짜만이라도 살린다. 빈 시각은 검사에서 걸린다.
    const dateOnly = toDateValue(raw);
    return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? `${dateOnly}T00:00` : clean(raw);
  }
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}`;
}

function toRow(cells: string[]): PasteRow {
  const [product, customerName, phone, receivedAt, orderConfirmedAt, callMemo, orderNo, calledAt] =
    cells.map(clean);

  return {
    product,
    customerName,
    // 하이픈을 넣어 다른 화면과 같은 모양으로 저장한다.
    phone: formatPhone(phone),
    receivedAt: toDateValue(receivedAt),
    orderConfirmedAt: toDateValue(orderConfirmedAt),
    callMemo,
    orderNo,
    calledAt: toDateTimeValue(calledAt),
  };
}

/**
 * 붙여넣은 글을 칸 묶음 목록으로.
 *
 * 웹 화면의 표를 복사하면 칸마다 줄이 바뀌고, 칸 사이에 빈 줄이 끼며,
 * **빈 칸은 전각 공백(　) 한 글자**로 온다. 전화번호2처럼 비어 있는 칸이
 * 흔한데, 그 줄을 버리면 여덟 칸이 일곱 칸이 되어 그 건이 통째로 사라지거나
 * 값이 한 칸씩 밀려 엉뚱한 자리에 들어간다.
 *
 * 그래서 "아무것도 없는 줄"(칸 사이의 간격)과 "공백만 있는 줄"(빈 칸)을 가른다.
 * 사은품 붙여넣기(lib/giftPaste.ts)와 같은 규칙이다.
 */
function toCellGroups(text: string): string[][] {
  const allLines = text.replace(/\r/g, '').split('\n');

  // 탭이 하나라도 있으면 '한 줄에 여덟 칸' 모양이다.
  const tabbed = allLines.filter((line) => !isHeaderLine(line));
  if (tabbed.some((line) => line.includes('\t'))) {
    return tabbed
      .map((line) => line.split('\t').map(clean))
      .filter((cells) => cells.some((c) => c.length > 0))
      .filter((cells) => !isHeaderGroup(cells));
  }

  /*
   * 한 칸씩 줄바꿈된 모양.
   *
   * 아무것도 없는 줄은 칸 사이의 간격이라 버리고, 공백만 있는 줄(전각 공백 등)은
   * 빈 칸이라 남긴다 — 그래서 길이를 먼저 재고 그 뒤에 다듬는다.
   */
  const lines = allLines
    .filter((line) => !(line.includes('\t') && isHeaderLine(line)))
    .filter((line) => line.length > 0)
    .map(clean);
  if (lines.length === 0) return [];

  // 앞에 붙은 머리글 덩어리를 걷어낸다. 여러 번 붙어 있으면 여러 번.
  let start = 0;
  while (
    start + PASTE_HEADERS.length <= lines.length &&
    isHeaderGroup(lines.slice(start, start + PASTE_HEADERS.length))
  ) {
    start += PASTE_HEADERS.length;
  }

  const groups: string[][] = [];
  for (let at = start; at < lines.length; at += PASTE_HEADERS.length) {
    groups.push(lines.slice(at, at + PASTE_HEADERS.length));
  }
  return groups;
}

/**
 * @returns 읽은 줄, 문제가 있는 줄, 못 읽고 버린 덩어리 수
 */
export function parseComplaintPaste(text: string): PasteResult {
  const groups = toCellGroups(text);

  const rows: PasteRow[] = [];
  const problems: PasteResult['problems'] = [];
  let skipped = 0;

  for (const cells of groups) {
    // 칸이 모자라면 읽을 수 없다. 억지로 채우면 값이 밀려 엉뚱한 칸에 들어간다.
    if (cells.filter((c) => c.length > 0).length === 0) continue;
    if (cells.length < PASTE_HEADERS.length) {
      skipped++;
      continue;
    }

    const row = toRow(cells);
    rows.push(row);

    // 등록할 때와 같은 함수로 미리 본다 — 눌러 보고 나서 알게 되면 늦다.
    const error = validateComplaintInput({
      product: row.product,
      customerName: row.customerName,
      phone: row.phone,
      orderNo: row.orderNo,
      receivedAt: row.receivedAt,
      orderConfirmedAt: row.orderConfirmedAt,
      calledAt: row.calledAt,
      callMemo: row.callMemo,
    });
    if (error) problems.push({ at: rows.length, reason: error, row });
  }

  return { rows, problems, skipped };
}
