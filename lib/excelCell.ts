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
