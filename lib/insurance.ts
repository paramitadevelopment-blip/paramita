/**
 * 주민번호 앞자리에서 실제 생년월일을 읽는다.
 * 나이 계산과 생년월일 정렬이 같은 규칙(성별코드로 세기 판단)을 써야 하므로
 * 한 곳에 모아 둔다. 읽을 수 없으면 null이다.
 */
export function parseJuminBirth(jumin: unknown): Date | null {
  try {
    const text = String(jumin ?? '').replace('-', '').trim();

    if (text.length < 7) return null;

    const birthYY = text.substring(0, 2);
    const birthMM = text.substring(2, 4);
    const birthDD = text.substring(4, 6);
    const genderCode = text.substring(6, 7);

    // 숫자 유효성 검사
    if (!/^\d+$/.test(birthYY + birthMM + birthDD + genderCode)) return null;

    let fullYear: number;
    switch (genderCode) {
      case '1':
      case '2':
      case '5':
      case '6':
        fullYear = 1900 + parseInt(birthYY);
        break;
      case '3':
      case '4':
      case '7':
      case '8':
        fullYear = 2000 + parseInt(birthYY);
        break;
      case '9':
      case '0':
        fullYear = 1800 + parseInt(birthYY);
        break;
      default:
        return null;
    }

    const mm = parseInt(birthMM);
    const dd = parseInt(birthDD);

    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

    const birthDate = new Date(fullYear, mm - 1, dd);

    // 날짜 유효성 검사 (2월 30일 같은 값을 걸러낸다)
    if (
      birthDate.getFullYear() !== fullYear ||
      birthDate.getMonth() !== mm - 1 ||
      birthDate.getDate() !== dd
    ) {
      return null;
    }

    return birthDate;
  } catch {
    return null;
  }
}

/**
 * 생년월일 정렬용 값 (yyyymmdd).
 * 읽을 수 없는 값은 가장 큰 수를 줘서 뒤로 밀린다 — 자동 배분에서 먼저 자리를
 * 차지하지 않게 하려는 것이다.
 */
export function birthSortKey(jumin: unknown): number {
  const birth = parseJuminBirth(jumin);
  if (!birth) return Number.MAX_SAFE_INTEGER;
  return birth.getFullYear() * 10000 + (birth.getMonth() + 1) * 100 + birth.getDate();
}

/**
 * 보험나이 계산 (한국 보험 기준)
 * @param jumin 생년월일성별 (예: "6609012" 또는 "660901-2")
 * @returns 보험나이 또는 -1 (오류)
 */
export function calculateInsuranceAge(jumin: string, baseDate: Date = new Date()): number {
  try {
    const birthDate = parseJuminBirth(jumin);
    if (!birthDate) return -1;

    // 만나이 계산
    let ageFull = baseDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = baseDate.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && baseDate.getDate() < birthDate.getDate())) {
      ageFull -= 1;
    }

    // 보험나이 = 마지막 생일로부터 6개월 경과 시 +1
    const lastBirthday = new Date(baseDate.getFullYear(), birthDate.getMonth(), birthDate.getDate());
    if (lastBirthday > baseDate) {
      lastBirthday.setFullYear(lastBirthday.getFullYear() - 1);
    }

    const sixMonthsLater = new Date(lastBirthday);
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

    if (sixMonthsLater <= baseDate) {
      return ageFull + 1;
    } else {
      return ageFull;
    }
  } catch {
    return -1;
  }
}

/**
 * 주문번호를 비교용 키로 정규화
 * 엑셀에서 같은 주문번호가 텍스트/숫자로 섞여 들어와도 같은 키가 되도록 맞춘다.
 */
export function normalizeOrderKey(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

/**
 * 주문번호 기준 중복 제거 (VBA RemoveDuplicatesByOrderNum과 동일한 규칙)
 * - 먼저 나온 행을 남기고 이후 중복은 버린다
 * - 주문번호가 비어 있으면 중복 판정 없이 살린다
 * - 대소문자는 구분하지 않는다 (VBA vbTextCompare)
 *
 * @param items 대상 목록
 * @param getOrderValue 항목에서 주문번호 값을 꺼내는 함수
 */
export function dedupeByOrderNumber<T>(
  items: T[],
  getOrderValue: (item: T) => unknown
): { items: T[]; removed: T[]; removedCount: number } {
  const seen = new Set<string>();
  const result: T[] = [];
  const removed: T[] = [];

  for (const item of items) {
    const key = normalizeOrderKey(getOrderValue(item));

    if (!key) {
      result.push(item);
      continue;
    }

    const comparableKey = key.toLowerCase();

    if (seen.has(comparableKey)) {
      removed.push(item);
      continue;
    }

    seen.add(comparableKey);
    result.push(item);
  }

  return { items: result, removed, removedCount: removed.length };
}

/**
 * 고객 기준 중복 제거: 전화번호(tel2) + 고객명 + 상품명
 *
 * 세 값이 모두 같아야 중복이다. 상품명이 다르면 같은 사람이라도 별개 건이다.
 *   김철수 / 01012345678 / 동양생명 실손보험  ─┐ 전부 같음 → 뒤엣것 제거
 *   김철수 / 01012345678 / 동양생명 실손보험  ─┘
 *   김철수 / 01012345678 / 동양생명 암보험   → 상품이 다름 → 유지
 *   김철수 / 01012345678 / 흥국화재 운전자   → 상품이 다름 → 유지
 *
 * 세 값 중 하나라도 비어 있으면 같은 사람인지 판단할 근거가 없으므로 살린다.
 * 조용히 지우는 것보다 중복이 한 건 남는 쪽이 낫다.
 */
export function dedupeByCustomerKey<T>(
  items: T[],
  getName: (item: T) => unknown,
  getPhone: (item: T) => unknown,
  getProduct: (item: T) => unknown
): { items: T[]; removed: T[]; removedCount: number } {
  const seen = new Set<string>();
  const result: T[] = [];
  const removed: T[] = [];

  for (const item of items) {
    const name = String(getName(item) ?? '').trim().toLowerCase();
    const phone = normalizePhone(getPhone(item));
    const product = normalizeProductName(getProduct(item));

    if (!name || !phone || !product) {
      result.push(item);
      continue;
    }

    const key = `${phone}|${name}|${product}`;

    if (seen.has(key)) {
      removed.push(item);
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return { items: result, removed, removedCount: removed.length };
}

/**
 * 배포 파일에서 제외할 컬럼
 * 업체에 넘길 필요가 없는 내부 관리용 열이다.
 */
export const EXCLUDED_COLUMNS = ['구분', '방송사명', '주문상태', '업체명', '비고'];

/**
 * 배포 파일에서 뺄 컬럼인지 판정
 * @param header 엑셀 헤더명
 */
export function isExcludedColumn(header: string): boolean {
  const h = (header ?? '').trim();

  // 헤더가 비어 있는 열 (원본 A열). xlsx는 이런 열에 __EMPTY 키를 붙인다.
  if (!h || /^__EMPTY/.test(h)) {
    return true;
  }

  return EXCLUDED_COLUMNS.includes(h);
}

/**
 * 상품명 정규화
 *
 * 상품명이 "완전히 같을 때"만 중복으로 본다. 보험사만 같고 상품이 다르면
 * ("동양생명 실손보험" vs "동양생명 암보험") 같은 사람이 둘 다 가입할 수 있는
 * 별개 건이므로 중복이 아니다.
 *
 * 앞뒤 공백, 연속 공백, 대소문자만 맞춰준다. 이건 표기 흔들림이지 다른 상품이 아니다.
 */
export function normalizeProductName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * 전화번호 정규화
 * "010-1234-5678", "01012345678", "010 1234 5678" 을 같은 키로 만든다.
 */
export function normalizePhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * 분류/배포에 필요한 컬럼들의 실제 헤더명
 * 못 찾은 컬럼은 null이다.
 */
export interface ColumnMap {
  addressCol: string | null;
  juminCol: string | null;
  orderCol: string | null;
  nameCol: string | null;
  phoneCol: string | null;
  productCol: string | null;
  /** 상담 예정 시각. 없는 파일도 있으므로 필수가 아니다. */
  memoCol: string | null;
}

/**
 * 없으면 분류를 못 하는 컬럼과 그 표시 이름.
 * 여기 없는 컬럼은 선택이다 (상담메모).
 */
const COLUMN_LABELS: Partial<Record<keyof ColumnMap, string>> = {
  addressCol: '주소',
  juminCol: '생년월일',
  orderCol: '주문번호',
  nameCol: '고객명',
  phoneCol: 'tel2',
  productCol: '상품명',
};

/**
 * 엑셀 헤더에서 필요한 컬럼을 찾는다.
 *
 * 미리보기(classify)와 실제 배포(deploy)가 반드시 같은 컬럼을 봐야 하므로
 * 매칭 규칙은 여기 한 곳에만 둔다. 양쪽에 따로 두면 언젠가 갈라진다.
 */
export function findRequiredColumns(headers: string[]): ColumnMap {
  const cols: ColumnMap = {
    addressCol: null,
    juminCol: null,
    orderCol: null,
    nameCol: null,
    phoneCol: null,
    productCol: null,
    memoCol: null,
  };

  for (const header of headers) {
    const h = String(header ?? '').toLowerCase().trim();

    if (!cols.addressCol && (h.includes('주소') || h === 'address')) {
      cols.addressCol = header;
    }
    if (!cols.juminCol && (h.includes('생년월일') || h === 'jumin' || h === 'birthday')) {
      cols.juminCol = header;
    }
    if (!cols.orderCol && (h.includes('주문번호') || h === 'ordernumber' || h === 'order_no')) {
      cols.orderCol = header;
    }
    if (!cols.nameCol && (h.includes('고객명') || h.includes('이름') || h.includes('성명') || h === 'name')) {
      cols.nameCol = header;
    }
    // tel2가 중복 판정 기준이다. tel1/연락처는 tel2가 없을 때만 쓴다.
    if (h === 'tel2') {
      cols.phoneCol = header;
    }
    if (!cols.phoneCol && (h.includes('연락처') || h.includes('휴대폰') || h.includes('핸드폰') || h.startsWith('tel') || h === 'phone')) {
      cols.phoneCol = header;
    }
    if (!cols.productCol && (h.includes('상품명') || h === 'product')) {
      cols.productCol = header;
    }
    if (!cols.memoCol && (h.includes('상담메모') || h === 'memo')) {
      cols.memoCol = header;
    }
  }

  return cols;
}

/**
 * 못 찾은 컬럼의 표시용 이름 목록.
 * 비어 있으면 필요한 컬럼이 전부 있다는 뜻이다.
 */
export function getMissingColumnLabels(cols: ColumnMap): string[] {
  return (Object.keys(COLUMN_LABELS) as Array<keyof ColumnMap>)
    .filter((key) => !cols[key])
    .map((key) => COLUMN_LABELS[key]!);
}

/**
 * 보험사 판정: 상품명에서 보험사 추출
 * @param productName 상품명
 * @returns 'hk' (흥국) | 'dy' (동양) | null (판정 불가)
 */
export function getInsurerType(productName: unknown): 'hk' | 'dy' | null {
  const product = String(productName || '').trim();

  if (!product) return null;

  // 동양 우선 체크
  if (product.includes('동양')) return 'dy';
  // 흥국 체크
  if (product.includes('흥국')) return 'hk';

  return null;
}

/**
 * 행 목록에서 보험사 판정 (모든 행이 같은 보험사여야 함)
 * @param rows 행 목록
 * @param productColIdx 상품명 컬럼 인덱스
 * @returns 'hk' | 'dy' | null
 */
export function getInsurerTypeFromRows(rows: string[][], productColIdx: number): 'hk' | 'dy' | null {
  if (rows.length === 0 || productColIdx < 0) return null;

  const types = new Set<'hk' | 'dy'>();

  for (const row of rows) {
    // 엑셀에서 온 행은 빈 셀이 구멍으로 남아 있을 수 있다. row 자체가 없을 수도 있다.
    const type = getInsurerType(row?.[productColIdx]);
    if (type) {
      types.add(type);
    }
  }

  // 모든 행이 같은 보험사여야 함. 섞여 있으면 null
  if (types.size === 1) {
    return Array.from(types)[0];
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// 보험사별 부서 배정
//
// 흥국과 동양은 나이 구간만 다르고, 70세 미만 주소 배정은 완전히 같다.
// 규칙 전문은 docs 흐름도 참고.
// ─────────────────────────────────────────────────────────────

/** 자동 배정하지 않고 사람이 부서를 고르는 지역 */
export const SELECTABLE_REGIONS = ['서울', '경기', '인천', '강원'] as const;
export type SelectableRegion = (typeof SELECTABLE_REGIONS)[number];

/**
 * 지역별로 고를 수 있는 부서.
 * 강원만 경기지사를 뺀다 — 흥국·동양 공통.
 */
export const REGION_CHOICES: Record<SelectableRegion, readonly string[]> = {
  서울: ['경기', '굿모닝제너럴', '파라인슈1'],
  경기: ['경기', '굿모닝제너럴', '파라인슈1'],
  인천: ['경기', '굿모닝제너럴', '파라인슈1'],
  강원: ['굿모닝제너럴', '파라인슈1'],
};

// ─────────────────────────────────────────────────────────────
// 상담메모 규칙 (업로드 화면 체크박스로 켠다)
//
// 상담 예정 시각이 "오늘 11시"보다 앞이면 (지난 날짜 포함) 파라 계열로 몰고,
// 그 안에서 나이로만 1/2를 가른다. 주소·한울부원 규칙은 타지 않는다.
// ─────────────────────────────────────────────────────────────

/**
 * 상담메모 규칙을 적용할 때 넘기는 값.
 * assignRow에 이걸 주면 규칙이 켜지고, 안 주면 꺼진다.
 * on/off를 따로 된 플래그로 두면 "켰는데 memo를 안 넘긴" 조합이 생긴다.
 */
export interface MemoRuleContext {
  /** 상담메모 값. formatCellValue를 거친 값이어야 한다 */
  memo: unknown;
  /** 규칙이 보는 "오늘" */
  now: Date;
}

/** 이 시각보다 앞이면 규칙이 걸린다 */
export const MEMO_CUTOFF_HOUR = 11;

/**
 * 상담메모에서 맨 앞 날짜/시각을 읽는다.
 * "2026-08-19 14:00:00 14시~15시 전화요청"처럼 뒤에 글이 붙어도 된다.
 * 시각이 없으면 0시로 본다. 못 읽으면 null.
 *
 * 엑셀 날짜 칸은 Date로 들어오므로 부르는 쪽에서 formatCellValue를 거쳐야 한다.
 * 여기서 Date를 직접 다루면 1899년 타임존 오차 때문에 하루 밀린다.
 */
export function parseMemoDateTime(memo: unknown): Date | null {
  const text = String(memo ?? '').trim();
  if (!text) return null;

  const m = text.match(
    /(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!m) return null;

  const at = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0)
  );
  return Number.isNaN(at.getTime()) ? null : at;
}

/** 상담 예정 시각이 기준일 11시보다 앞인가 (지난 날짜면 전부 참) */
export function isMemoBeforeCutoff(memo: unknown, now: Date = new Date()): boolean {
  const at = parseMemoDateTime(memo);
  if (!at) return false;

  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    MEMO_CUTOFF_HOUR,
    0,
    0,
    0
  );
  return at.getTime() < cutoff.getTime();
}

/**
 * 배정 결과.
 * 부서명 '경기'(업체)와 지역 '경기'(경기도)는 다른 값이다.
 * 판별 유니온으로 두 개가 같은 칸에 못 들어가게 막는다.
 */
export type Assignment =
  | { kind: 'dept'; dept: string }
  | { kind: 'select'; region: SelectableRegion }
  | { kind: 'error'; reason: string };

const DEPT_BY_REGION: Array<[RegExp, string]> = [
  [/^(부산|울산|경남|경상남도|대구)/, '한울부원'],
  [/^(전남|전북|전라남도|전라북도|전라도|광주)/, '경기'],
  [/^(경북|경상북도)/, '굿모닝제너럴'],
  [/^(충북|충남|충청북도|충청남도|세종|대전|제주)/, '파라인슈1'],
];

const REGION_PATTERNS: Array<[RegExp, SelectableRegion]> = [
  [/^서울/, '서울'],
  [/^(경기도|경기)/, '경기'],
  [/^인천/, '인천'],
  [/^(강원도|강원|강릉|속초)/, '강원'],
];

/**
 * 주소 → 배정. 나이와 무관하게 주소만 본다.
 * 시·도를 못 읽으면 '이외지역'으로 보낸다. 조용히 아무 부서에나 넣으면
 * 잘못 나간 건을 나중에 찾을 수 없다.
 */
export function assignByAddress(address: unknown): Assignment {
  const first = String(address ?? '').trim().split(/[\s,]+/)[0] || '';

  if (!first) return { kind: 'dept', dept: '이외지역' };

  for (const [pattern, dept] of DEPT_BY_REGION) {
    if (pattern.test(first)) return { kind: 'dept', dept };
  }

  for (const [pattern, region] of REGION_PATTERNS) {
    if (pattern.test(first)) return { kind: 'select', region };
  }

  return { kind: 'dept', dept: '이외지역' };
}

/** 주소가 부산·울산·경남·대구인가 (동양 70~75세 구간에서만 쓴다) */
function isHanulRegion(address: unknown): boolean {
  const first = String(address ?? '').trim().split(/[\s,]+/)[0] || '';
  return DEPT_BY_REGION[0][0].test(first);
}

/** 주소에서 시·도를 아예 못 읽는가 */
function isUnreadableAddress(address: unknown): boolean {
  const first = String(address ?? '').trim().split(/[\s,]+/)[0] || '';
  if (!first) return true;
  return (
    !DEPT_BY_REGION.some(([p]) => p.test(first)) &&
    !REGION_PATTERNS.some(([p]) => p.test(first))
  );
}

/**
 * 보험사별 부서 배정.
 * @param insurer 'hk'(흥국) | 'dy'(동양)
 * @param jumin   생년월일성별
 * @param address 주소
 * @param memoRule 상담메모 규칙. 주면 켜지고, 안 주면 꺼진다
 */
export function assignRow(
  insurer: 'hk' | 'dy',
  jumin: unknown,
  address: unknown,
  memoRule?: MemoRuleContext
): Assignment {
  const age = calculateInsuranceAge(String(jumin ?? ''));

  if (age === -1) {
    return { kind: 'error', reason: '생년월일 형식 오류' };
  }

  // 상담 예정이 지났거나 오늘 11시 이전이면 파라 계열로 몰고 나이로만 가른다.
  // 나이 기준 70세는 아래 규칙과 같다 — 흥국 70세 이상, 동양 70세 이상 모두
  // 파라인슈2로 가므로 여기서도 같은 선을 쓴다.
  if (memoRule && isMemoBeforeCutoff(memoRule.memo, memoRule.now)) {
    return { kind: 'dept', dept: age >= 70 ? '파라인슈2' : '파라인슈1' };
  }

  if (insurer === 'hk') {
    // 흥국: 70세 하나로 가른다
    if (age >= 70) return { kind: 'dept', dept: '파라인슈2' };
    return assignByAddress(address);
  }

  // 동양: 70세와 75세, 둘로 가른다
  if (age >= 70 && age < 75) {
    // 이 구간만 주소를 한 번 본다
    if (isUnreadableAddress(address)) return { kind: 'dept', dept: '이외지역' };
    if (isHanulRegion(address)) return { kind: 'dept', dept: '한울부원' };
    return { kind: 'dept', dept: '파라인슈2' };
  }

  if (age >= 75) return { kind: 'dept', dept: '파라인슈2' };

  // 70세 미만 — 흥국과 완전히 같다
  return assignByAddress(address);
}

/** 배정에 쓰이는 모든 부서명 */
export const ASSIGN_DEPARTMENTS = [
  '한울부원',
  '경기',
  '굿모닝제너럴',
  '파라인슈1',
  '파라인슈2',
  '이외지역',
] as const;

/**
 * 사람이 부서를 골라야 하는 행의 키.
 *
 * 주문번호로 잡는다 — 화면은 지역별로 묶어 보여주고 배포는 파일 행 순서로 도는데,
 * 위치 번호로 주고받으면 선택이 엉뚱한 사람에게 붙기 때문이다.
 * 다만 주문번호는 비어 있을 수 있고(중복 제거는 빈 값을 지우지 않는다),
 * 빈 값끼리는 키가 겹쳐 한 사람을 고르면 다른 사람까지 같이 바뀐다.
 * 그래서 비었을 때만 중복 제거 후 순번으로 대신한다.
 *
 * 중복 제거를 마친 목록은 분류와 배포가 같은 규칙·같은 순서로 만들므로 순번이 서로 맞는다.
 * 주문번호가 있으면 중복 제거가 이미 유일함을 보장한다.
 *
 * @param orderValue    행의 주문번호
 * @param dedupedIndex  중복 제거 후 목록에서의 위치
 */
export function pendingRowKey(orderValue: unknown, dedupedIndex: number): string {
  const order = normalizeOrderKey(orderValue);
  return order || `#${dedupedIndex}`;
}

/**
 * 주문번호가 비어 있는가.
 *
 * 주문번호는 이 건을 가리키는 유일한 식별자다. 없으면
 *   - 중복 제거 1단계(주문번호 기준)를 건너뛰고
 *   - 사람이 부서를 고를 때 행을 지목할 수단이 사라지며
 *   - 배포 뒤에 문제가 생겨도 어느 건인지 되짚을 수 없다.
 * 조용히 내보내면 나중에 찾을 방법이 없으므로 배포를 막는 쪽이 맞다.
 */
export function isOrderNumberMissing(orderValue: unknown): boolean {
  return normalizeOrderKey(orderValue) === '';
}

/** 주문번호가 없어 배포를 막을 때 쓰는 사유. 분류와 배포가 같은 문구를 쓴다. */
export const ORDER_NUMBER_MISSING_REASON = '주문번호 없음';

/**
 * 자동 배분이 쓰는 소속들.
 * REGION_CHOICES에 나오는 것들의 합집합이다. 한울부원·파라인슈2·이외지역은
 * 사람이 고르는 대상이 아니므로 여기 없다.
 */
export const AUTO_DISTRIBUTE_DEPARTMENTS = ['경기', '굿모닝제너럴', '파라인슈1'] as const;

/** 자동 배분에 넣을 한 건 */
export interface PendingEntry {
  /** pendingRowKey로 만든 행 식별자 */
  key: string;
  region: SelectableRegion;
  /** 생년월일성별 (정렬 기준) */
  jumin: unknown;
}

/**
 * 사람이 골라야 하는 건들을 소속별 숫자가 고르게 되도록 나눈다.
 *
 * - 규칙으로 이미 배정된 수(baseCounts)를 시작점으로 잡는다. 그래야 최종 숫자가 맞는다.
 * - 강원 건을 먼저 넣는다. 갈 수 있는 곳이 굿모닝제너럴·파라인슈1 둘뿐이라,
 *   나중에 넣으면 그 둘이 이미 차 있어 한쪽으로 몰린다.
 * - 그 다음 나머지를 생년월일이 이른 순으로 넣는다. 같은 순서를 다시 돌리면
 *   같은 결과가 나와야 하므로 정렬 기준을 고정한다.
 * - 매번 "갈 수 있는 곳 중 가장 적게 받은 곳"에 넣는다.
 *
 * @param pending    선택 대기 건들
 * @param baseCounts 규칙으로 이미 배정된 소속별 건수
 * @returns key → 소속명
 */
export function autoDistributePending(
  pending: PendingEntry[],
  baseCounts: Record<string, number> = {}
): Record<string, string> {
  const counts: Record<string, number> = {};
  for (const dept of AUTO_DISTRIBUTE_DEPARTMENTS) {
    counts[dept] = baseCounts[dept] ?? 0;
  }

  // 강원을 앞으로. 그 안에서는 생년월일 순, 같으면 키 순으로 고정한다.
  const ordered = [...pending].sort((a, b) => {
    const aNarrow = a.region === '강원' ? 0 : 1;
    const bNarrow = b.region === '강원' ? 0 : 1;
    if (aNarrow !== bNarrow) return aNarrow - bNarrow;

    const diff = birthSortKey(a.jumin) - birthSortKey(b.jumin);
    if (diff !== 0) return diff;
    return a.key.localeCompare(b.key);
  });

  const picks: Record<string, string> = {};

  for (const entry of ordered) {
    const choices = REGION_CHOICES[entry.region];
    if (!choices || choices.length === 0) continue;

    // 가장 적게 받은 곳. 같으면 REGION_CHOICES에 적힌 순서를 따라 결과를 고정한다.
    let best = choices[0];
    for (const dept of choices) {
      if ((counts[dept] ?? 0) < (counts[best] ?? 0)) best = dept;
    }

    picks[entry.key] = best;
    counts[best] = (counts[best] ?? 0) + 1;
  }

  return picks;
}

/**
 * 업로드 파일명 규칙.
 *
 * `YYYYMMDD` 뒤에 보험사명이 와야 한다. 날짜와 회사명 사이는 밑줄이든 공백이든
 * 상관없다 — 받는 파일이 두 표기를 오가는데 한쪽만 받으면 내용은 멀쩡한 파일이
 * 이름 때문에 반려된다.
 *
 * 화면과 서버가 반드시 같은 판정을 써야 한다. 서버가 느슨하면 화면이 거부한
 * 파일이 API로는 들어와, 보험사를 못 가려 배포에서 막힐 파일이 이미 저장된 뒤다.
 */
const UPLOAD_FILE_NAME_PATTERN = /^\d{8}[_\s]*(동양생명|흥국생명|한화생명)/;

export function isValidUploadFileName(fileName: unknown): boolean {
  return UPLOAD_FILE_NAME_PATTERN.test(String(fileName ?? ''));
}

/** 파일명 규칙을 어겼을 때 보여줄 문구. 화면과 서버가 같은 말을 하도록 모아 둔다. */
export const UPLOAD_FILE_NAME_HINT =
  '파일명은 YYYYMMDD 회사명 형식이어야 합니다. (예: 20260815_동양생명.xlsx, 20260815 동양생명.xlsx / 흥국생명, 한화생명도 가능)';

/**
 * 배정방식 — 그 행이 어떻게 소속을 얻었는지.
 *
 * 규칙이 주소·나이로 정했으면 자동분류, 관리자가 배정할 소속 화면에서 넘겼으면
 * 직접분류다. 배포하고 나면 소속만 남아 "이 고객이 왜 여기로 갔나"를 되짚을 수
 * 없어서 함께 기록한다. 분류·배포·다운로드가 같은 값을 써야 하므로 여기 모아 둔다.
 */
export const ASSIGNED_BY_COLUMN = '배정방식';
export const ASSIGNED_BY_RULE = '자동분류';
export const ASSIGNED_BY_PERSON = '직접분류';

/** 시스템이 붙이는 열 이름. 분류·배포·다운로드가 같은 이름을 써야 한다. */
export const ROW_NO_COLUMN = '번호';
export const ASSIGNED_DEPT_COLUMN = '배정소속';
export const ASSIGNED_AT_COLUMN = '배정날짜';
export const DUPLICATE_REASON_COLUMN = '중복사유';

/** 배정날짜 표기. 파일과 DB가 같은 모양이어야 눈으로 대조된다. */
export function formatAssignedAt(date: Date): string {
  return `${date.toLocaleDateString('ko-KR').slice(0, -1)} ${date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}
