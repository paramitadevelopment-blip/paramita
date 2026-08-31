import { formatCellValue } from '@/lib/excelCell';

/**
 * 파일 안에 글자로 적혀 있는 날짜를 다시 Date로 읽는다.
 *
 * 배정날짜는 사람이 읽으라고 `2026. 8. 25 오후 05:19:52`로 적어 둔 것이고,
 * 접수일자는 거래처가 준 `2026-08-11`이다. 둘 다 문자열이라 그대로는 정렬도
 * 비교도 안 된다.
 *
 * 읽을 수 없으면 null이다. 못 읽은 값을 오늘로 때우면 "언제 배정됐나"가
 * 조용히 틀려서, 지사가 엉뚱한 날짜를 보고 고객에게 연락하게 된다.
 */

/** `오후 05:19:52` → 24시간제 시각 */
function parseKoreanTime(text: string): { h: number; m: number; s: number } | null {
  const m = text.match(/(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;

  let hour = Number(m[2]);
  // 오후 12시는 12시 그대로, 오전 12시는 0시다. 여기를 뒤집으면 12시간 어긋난다.
  if (m[1] === '오후' && hour < 12) hour += 12;
  if (m[1] === '오전' && hour === 12) hour = 0;

  return { h: hour, m: Number(m[3]), s: m[4] ? Number(m[4]) : 0 };
}

export function parseDateCell(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    /*
     * xlsx가 만든 Date는 그대로 읽으면 하루 밀린다.
     *
     * 1899년 서울 표준시가 UTC+8:27:52였는데 JS는 타임존을 분 단위로만 다뤄서
     * 그 52초가 오차로 남는다. 날짜만 있는 칸이 자정이 아니라 자정 직전
     * (전날 23:59:08)으로 들어와, 연·월·일을 읽으면 하루 전 날짜가 나온다.
     *
     * 저장할 때 formatCellValue가 푸는 것과 같은 방식으로 되돌린다. 두 곳이
     * 다른 기준을 쓰면 같은 셀이 파일에 적힐 때와 비교될 때 다른 날이 된다.
     */
    const text = formatCellValue(value);
    return typeof text === 'string' ? parseDateText(text) : value;
  }

  return parseDateText(String(value ?? '').trim());
}

function parseDateText(text: string): Date | null {
  if (!text) return null;

  // `2026. 8. 25 오후 05:19:52` / `2026-08-11` / `2026/08/11 13:00`
  const date = text.match(/(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]?\s*(\d{1,2})/);
  if (!date) return null;

  const year = Number(date[1]);
  const month = Number(date[2]);
  const day = Number(date[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // 날짜 뒤쪽에서만 시각을 찾는다. 앞에서 찾으면 연·월·일 숫자를 시로 잘못 읽는다.
  const time = parseKoreanTime(text.slice(date.index! + date[0].length));

  const parsed = new Date(year, month - 1, day, time?.h ?? 0, time?.m ?? 0, time?.s ?? 0);

  // 2월 30일 같은 값은 3월로 넘어간다. 되짚어 확인한다.
  if (parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;

  return parsed;
}
