/**
 * 보험나이 계산 (한국 보험 기준)
 * 주민번호 7자리 기반으로 계산
 * @param jumin 생년월일성별 (예: "6609012" 또는 "660901-2")
 * @returns 보험나이 또는 -1 (오류)
 */
export function calculateInsuranceAge(jumin: string, baseDate: Date = new Date()): number {
  try {
    jumin = jumin.replace('-', '').trim();

    if (jumin.length < 7) {
      return -1;
    }

    const birthYY = jumin.substring(0, 2);
    const birthMM = jumin.substring(2, 4);
    const birthDD = jumin.substring(4, 6);
    const genderCode = jumin.substring(6, 7);

    // 숫자 유효성 검사
    if (!/^\d+$/.test(birthYY + birthMM + birthDD + genderCode)) {
      return -1;
    }

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
        return -1;
    }

    const mm = parseInt(birthMM);
    const dd = parseInt(birthDD);

    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) {
      return -1;
    }

    const birthDate = new Date(fullYear, mm - 1, dd);

    // 날짜 유효성 검사
    if (
      birthDate.getFullYear() !== fullYear ||
      birthDate.getMonth() !== mm - 1 ||
      birthDate.getDate() !== dd
    ) {
      return -1;
    }

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
 * 주소 기반 지역 분류
 * @param address 주소
 * @returns 분류명 ("한울부원" | "굿모닝제너럴" | "경기" | "수도권" | "이외지역")
 */
export function getRegionCategory(address: string): string {
  address = address?.trim() || '';

  if (!address) {
    return '이외지역';
  }

  // 맨 앞 시/도만 추출 (띄어쓰기 기준)
  const firstWord = address.split(/[\s,]+/)[0];

  // 한울부원: 부산, 울산, 경남, 대구
  if (/^(부산|울산|경남|경상남도|대구)/.test(firstWord)) {
    return '한울부원';
  }

  // 굿모닝제너럴: 경북, 강원, 강릉, 속초
  if (/^(경북|경상북도|강원|강원도|강릉|속초)/.test(firstWord)) {
    return '굿모닝제너럴';
  }

  // 경기 (업체명): 전남, 전북, 광주
  if (/^(전남|전북|전라남도|전라북도|광주)/.test(firstWord)) {
    return '경기';
  }

  // 수도권: 서울, 경기, 인천
  if (/^(서울|경기|인천)/.test(firstWord)) {
    return '수도권';
  }

  // 이외지역: 대전, 충남, 충북, 세종, 제주 등
  return '이외지역';
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
): { items: T[]; removedCount: number } {
  const seen = new Set<string>();
  const result: T[] = [];
  let removedCount = 0;

  for (const item of items) {
    const key = normalizeOrderKey(getOrderValue(item));

    if (!key) {
      result.push(item);
      continue;
    }

    const comparableKey = key.toLowerCase();

    if (seen.has(comparableKey)) {
      removedCount++;
      continue;
    }

    seen.add(comparableKey);
    result.push(item);
  }

  return { items: result, removedCount };
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
 * 개별 행 분류
 * @param row 엑셀 행 데이터
 * @param addressCol 주소 컬럼명
 * @param juminCol 생년월일 컬럼명
 * @returns 분류명
 */
export function classifyRow(
  row: Record<string, any>,
  addressCol: string = 'address',
  juminCol: string = 'jumin'
): string {
  const jumin = String(row[juminCol] || '');
  const address = String(row[addressCol] || '');

  const insAge = calculateInsuranceAge(jumin);

  if (insAge === -1) {
    // 오류 건: 분류하지 않음 (또는 별도 처리)
    return 'error';
  }

  if (insAge >= 70) {
    return '70세이상';
  }

  // 70세 미만: 지역 분류
  return getRegionCategory(address);
}
