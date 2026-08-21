import * as XLSX from 'xlsx';

/**
 * 엑셀 셀 값을 화면/JSON에 실을 수 있는 형태로 바꾼다.
 *
 * XLSX를 cellDates로 읽으면 날짜 칸이 Date 객체로 들어온다. 그대로 두면
 *   - JSON으로 보낼 때 ISO 문자열(UTC)이 되어 날짜가 어긋나고
 *   - React에 그대로 넘기면 "Objects are not valid as a React child"로 터진다.
 * 그래서 보이는 쪽으로 넘기기 전에 반드시 이 함수를 거친다.
 *
 * 엑셀에 다시 쓸 값에는 쓰지 않는다. 거기서는 Date인 채로 넘겨야
 * 진짜 날짜 셀로 저장된다 (저장 시 아래 오차가 그대로 상쇄되어 원래 일련번호로 돌아간다).
 */

// xlsx의 numdate()는 이 기준값으로 일련번호를 Date로 바꾼다 (xlsx.js: dnthresh).
// 서울은 1899년 표준시가 UTC+8:27:52였는데 JS는 타임존 오프셋을 분 단위로만
// 다루므로, 그 52초가 오차로 남아 Date가 자정 직전(23:59:08)으로 밀린다.
// 날짜만 있는 칸이 하루 전으로 보이는 원인이라, 같은 식으로 되돌려서 읽는다.
const BASE_DATE = new Date(1899, 11, 30, 0, 0, 0);
const REF_DATE = new Date();
const DN_THRESH =
  BASE_DATE.getTime() +
  (REF_DATE.getTimezoneOffset() - BASE_DATE.getTimezoneOffset()) * 60000;

/** xlsx가 만든 Date를 원래 엑셀 일련번호로 되돌린다 (numdate의 역산). */
function toExcelSerial(date: Date): number {
  return (date.getTime() - DN_THRESH) / 86400000;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatCellValue(value: unknown): unknown {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return value;
  }

  // Date의 getFullYear/getMonth를 직접 읽으면 위 오차 때문에 하루 밀린다.
  // 일련번호로 되돌린 뒤 순수 계산으로 푸는 SSF를 쓴다.
  const parsed = XLSX.SSF.parse_date_code(toExcelSerial(value));
  if (!parsed) return value;

  const date = `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;

  // 시각이 0시 0분 0초면 날짜만 있는 칸이다. 00:00:00을 붙이면
  // 원본에 없던 정보가 있는 것처럼 보인다.
  if (parsed.H === 0 && parsed.M === 0 && parsed.S === 0) return date;

  return `${date} ${pad(parsed.H)}:${pad(parsed.M)}:${pad(parsed.S)}`;
}

/** 행 단위로 formatCellValue를 적용한다. */
export function formatCellRow(row: unknown[]): unknown[] {
  return row.map(formatCellValue);
}

/**
 * 날짜 칸에 잡아주는 자리.
 * 서식 자체는 'yyyy-mm-dd'(10자)지만, 그 길이에 딱 맞추면 엑셀에서 여전히
 * ########으로 나온다. 화면 배율·글꼴·서식 아이콘이 자리를 더 먹기 때문이다.
 * 넉넉히 잡아 확실히 보이게 한다.
 */
const DATE_DISPLAY_WIDTH = 22;
/**
 * 열 너비 상한. 무한정 늘리면 가로로만 길어지지만, 너무 낮으면 상품명처럼
 * 긴 값이 잘려 무슨 상품인지 알아볼 수 없다.
 */
const MAX_WIDTH = 80;
/**
 * 계산한 폭에 곱하는 여유.
 * wch는 기본 글꼴의 '0' 한 글자를 1로 세는 단위인데, 한글은 그보다 넓다.
 * 반각 기준으로만 세어 딱 맞추면 '동양생명(PM)_1통합' 같은 값이 잘려 나온다.
 */
const WIDTH_HEADROOM = 1.4;
const MIN_WIDTH = 8;
/**
 * 열별로 따로 잡아주는 최소 너비.
 *
 * 비워 두는 게 기본이다. 내용보다 넓게 잡으면 그 열이 자리를 차지해
 * 뒤에 오는 열(비고 등)이 화면 밖으로 밀린다.
 */
const MIN_WIDTH_BY_HEADER: Record<string, number> = {};
/** 한글·한자는 반각 기준으로 두 자리를 차지한다. */
const WIDE_CHAR = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/;

function displayWidth(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return DATE_DISPLAY_WIDTH;

  const text = String(value);
  let width = 0;
  for (const ch of text) width += WIDE_CHAR.test(ch) ? 2 : 1;
  return width;
}

/**
 * 열 너비를 내용에 맞춰 계산한다.
 *
 * 너비를 안 주면 엑셀 기본값(8자 남짓)으로 저장된다. '2026-08-16' 같은 날짜는
 * 열에 안 들어가면 값 대신 ########으로 표시된다 — 데이터는 멀쩡한데 받는 쪽에서는
 * 깨진 파일로 보인다. 헤더까지 포함해 가장 긴 값에 맞춘다.
 *
 * @param rows 헤더를 포함한 전체 행
 */
export function fitColumnWidths(rows: unknown[][]): Array<{ wch: number }> {
  // 열 개수를 먼저 정하고 0으로 채운다. 값이 있을 때만 채우면 전부 빈 열이
  // 배열의 구멍으로 남아, 그 뒤 열들의 너비가 한 칸씩 밀린다.
  let columnCount = 0;
  for (const row of rows) {
    if (Array.isArray(row) && row.length > columnCount) columnCount = row.length;
  }

  const widths = new Array<number>(columnCount).fill(0);

  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    row.forEach((cell, i) => {
      const w = displayWidth(cell);
      if (w > widths[i]) widths[i] = w;
    });
  }

  // 헤더 이름으로 지정한 최소 너비가 있으면 그걸 밑바닥으로 쓴다.
  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];

  // 여유를 곱하고 3칸을 더 준다. 딱 맞게 주면 서식·필터 화살표에 가려 또 잘린다.
  return widths.map((w, i) => {
    const header = String(headerRow[i] ?? '').trim();
    const floor = MIN_WIDTH_BY_HEADER[header] ?? MIN_WIDTH;
    const fitted = Math.ceil(w * WIDTH_HEADROOM) + 3;
    return { wch: Math.min(Math.max(fitted, floor), MAX_WIDTH) };
  });
}
