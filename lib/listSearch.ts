/**
 * 목록 검색 — 화면에 보이는 값이면 무엇으로든 찾힌다.
 *
 * 검색칸에 뭘 쳐야 나오는지 외워야 한다면 그건 검색이 아니다. 그래서 한 줄에
 * 실린 글자 칸은 전부 훑고, 사람이 실제로 치는 세 가지를 더 알아듣는다.
 *
 *   상태말   '보완 요청'이라고 치면 status='returned'인 줄
 *   날짜     '2026-09-08' · '2026-09' · '260908'이면 그날(그달)의 건
 *   전화     '01012345678'로 쳐도 '010-1234-5678'로 저장된 줄
 *
 * PostgREST의 or()는 쉼표로 조건을 가르고 괄호로 묶는다. 사람이 친 값에 그
 * 글자가 들어 있으면 조건이 쪼개져 엉뚱한 걸 찾거나 문법이 깨진다 — 그래서
 * 값은 반드시 escapeOr()를 거친다.
 */

/**
 * or() 안에 들어갈 값 하나를 안전하게 만든다.
 *
 * 큰따옴표로 감싸면 쉼표·괄호·점이 값의 일부로 읽힌다. 값 안의 따옴표와
 * 역슬래시만 벗겨 준다.
 */
export function escapeOr(value: string): string {
  // JSON 문자열 규칙이 PostgREST가 큰따옴표 안에서 쓰는 규칙과 같다.
  return JSON.stringify(value);
}

/** `칸.ilike.%값%` 여러 개. 값은 감싸서 넣는다. */
export function ilikeTerms(columns: readonly string[], value: string): string[] {
  const needle = escapeOr(`%${value}%`);
  return columns.map((column) => `${column}.ilike.${needle}`);
}

/**
 * 사람이 친 말이 어떤 상태를 가리키는가.
 *
 * 라벨을 그대로 다 치지 않아도 되게 '들어 있으면' 잡는다 — '보완'만 쳐도
 * '보완 요청'이 걸린다. 띄어쓰기는 무시한다.
 */
export function statusesMatching(
  value: string,
  labels: Record<string, string>
): string[] {
  const typed = value.replace(/\s+/g, '');
  if (!typed) return [];
  return Object.entries(labels)
    .filter(([code, label]) => {
      const plain = label.replace(/\s+/g, '');
      return plain.includes(typed) || code.toLowerCase() === value.toLowerCase();
    })
    .map(([code]) => code);
}

/** 하루의 시작과 끝(그리고 한 달). timestamptz 칸을 범위로 거를 때 쓴다. */
export interface DateSpan {
  from: string;
  to: string;
  /** 날짜만 담는 칸(접수일자·발주일)에 쓸 값. 하루짜리면 둘이 같다. */
  fromDay: string;
  toDay: string;
}

/**
 * 날짜처럼 생긴 말인가.
 *
 * 받아들이는 꼴: 2026-09-08 · 2026.9.8 · 2026/09/08 · 20260908 · 260908 ·
 * 2026-09 · 2026.9 · 202609. 아니면 null.
 */
export function dateSpanOf(value: string): DateSpan | null {
  const text = value.trim();
  const ymd = text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  const ym = text.match(/^(\d{4})[-./](\d{1,2})$/);
  const packed8 = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  const packed6 = text.match(/^(\d{2})(\d{2})(\d{2})$/);
  const packedYm = text.match(/^(\d{4})(\d{2})$/);

  const pad = (n: number) => String(n).padStart(2, '0');
  /** 그 달의 마지막 날. */
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

  let year = 0;
  let month = 0;
  let day: number | null = null;

  if (ymd) [year, month, day] = [+ymd[1], +ymd[2], +ymd[3]];
  else if (packed8) [year, month, day] = [+packed8[1], +packed8[2], +packed8[3]];
  // 260908 — 우리가 파일 이름에 쓰는 꼴이다. 2000년대로 읽는다.
  else if (packed6) [year, month, day] = [2000 + +packed6[1], +packed6[2], +packed6[3]];
  else if (ym) [year, month] = [+ym[1], +ym[2]];
  else if (packedYm) [year, month] = [+packedYm[1], +packedYm[2]];
  else return null;

  if (month < 1 || month > 12) return null;
  if (day !== null && (day < 1 || day > lastDay(year, month))) return null;

  const first = day ?? 1;
  const last = day ?? lastDay(year, month);
  return {
    from: `${year}-${pad(month)}-${pad(first)}T00:00:00.000Z`,
    // 끝은 다음 날 0시 직전까지. 시각이 붙은 값도 그날 안에 든다.
    to: `${year}-${pad(month)}-${pad(last)}T23:59:59.999Z`,
    fromDay: `${year}-${pad(month)}-${pad(first)}`,
    toDay: `${year}-${pad(month)}-${pad(last)}`,
  };
}

/**
 * 전화번호로 친 말이 저장된 꼴과 다를 때.
 *
 * '01012345678'로 쳐도 '010-1234-5678'로 저장된 줄을 찾아야 한다. 숫자만
 * 남겨 흔한 자리 나눔으로 다시 지어 함께 찾는다.
 */
export function phoneVariants(value: string): string[] {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return [];
  const shapes = new Set<string>([digits]);
  if (digits.startsWith('02')) {
    const middle = digits.length <= 9 ? 5 : 6;
    shapes.add(`${digits.slice(0, 2)}-${digits.slice(2, middle)}-${digits.slice(middle)}`);
  } else if (digits.length === 11) {
    shapes.add(`${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`);
  } else if (digits.length === 10) {
    shapes.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`);
  } else if (digits.length === 8) {
    shapes.add(`${digits.slice(0, 4)}-${digits.slice(4)}`);
  }
  shapes.delete(value);
  return [...shapes];
}

/**
 * 화면이 들고 있는 목록을 그 자리에서 거른다.
 *
 * 발주리스트처럼 서버에 검색을 물을 수 없는(이미 다 받아 둔) 목록에 쓴다.
 * 줄에 든 값을 하나도 빼놓지 않고 본다 — 어느 칸이 검색되는지 따로 정하면,
 * 칸이 하나 늘 때마다 검색에서 빠지는 칸이 하나 생긴다.
 *
 * 상태는 코드가 아니라 사람이 읽는 말로 찾는다('보완'). 하이픈이 든 값
 * (전화·날짜·운송장)은 숫자만 남겨서도 본다.
 */
export function rowMatches(
  row: object,
  term: string,
  statusLabels?: Record<string, string>
): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const tight = needle.replace(/\s+/g, '');
  const digits = needle.replace(/\D/g, '');

  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    const text = String(value).toLowerCase();
    if (text.includes(needle)) return true;

    // 010-1234-5678 을 01012345678 로 쳐도, 2026-09-08 을 20260908 로 쳐도.
    if (digits.length >= 4 && /[-.\s/]/.test(text) && text.replace(/\D/g, '').includes(digits)) {
      return true;
    }

    if (key === 'status' && statusLabels) {
      const label = statusLabels[String(value)];
      if (label && label.replace(/\s+/g, '').includes(tight)) return true;
    }
  }
  return false;
}

/**
 * 화면이 들고 있는 목록을 세울 때 두 값을 견준다.
 *
 * **방향을 직접 받는다.** 부르는 쪽이 결과를 뒤집게 두면(`-gap`) 빈 값도 같이
 * 뒤집혀, 내림차순으로 세운 순간 빈 줄이 목록 맨 위로 올라온다 — 세운 게
 * 아니라 망가진 것처럼 보인다. 빈 값은 어느 방향에서든 뒤에 있어야 한다.
 *
 * 글자는 한국어 순서로 견준다(localeCompare). 사전순이 아니면 '가나다'가
 * 뒤죽박죽으로 선다.
 */
export function compareValues(a: unknown, b: unknown, order: 'asc' | 'desc' = 'asc'): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  // 빈 값은 방향과 상관없이 뒤로. 그래서 여기서는 order를 보지 않는다.
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  const gap =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'ko');
  return order === 'asc' ? gap : -gap;
}

/** '#39'·'39'처럼 친 번호. 발주 묶음처럼 번호로 부르는 것에 쓴다. */
export function numberOf(value: string): number | null {
  const m = value.trim().match(/^#?(\d{1,9})$/);
  return m ? Number(m[1]) : null;
}
