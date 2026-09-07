import { calculateInsuranceAge, findRequiredColumns } from '@/lib/insurance';

/**
 * 분류 화면의 표를 보기 좋게 다시 세운다.
 *
 * 두 가지를 한다.
 *   1) 생년월일로 계산한 '나이' 열을 주소 바로 오른쪽에 넣는다
 *   2) 전화번호 열들을 그 나이 뒤로 모은다
 *
 * 배정은 **주소(지역)와 나이**로 갈린다. 그 둘이 붙어 있어야 "이 주소, 이
 * 나이라 이 소속"이 한 눈에 읽힌다. 전화번호는 판단에 쓰이지 않지만 원래
 * 양식에서 그 사이에 끼어 있어(고객명·Tel1·Tel2·우편번호·주소) 눈이 건너뛰어야
 * 했다. 뒤로 물려 두면 볼 것이 이어진다.
 *
 * **분류 화면에서만 한다.** 배포되는 파일의 열 순서는 그대로다 — 거래처가 받는
 * 파일 모양이 바뀌면 안 되고, 이 순서는 우리가 보려고 세운 것이다.
 *
 * 나이는 **배정이 쓰는 것과 같은 값**이어야 한다. 지역·나이 설정이 보험나이로
 * 거르는데 화면에 만나이가 뜨면 "70세 미만인데 왜 저 지사로 갔지"가 생긴다.
 * 그래서 계산도 열 찾기도 배정과 같은 함수(calculateInsuranceAge,
 * findRequiredColumns)를 쓴다.
 */
export const AGE_COLUMN = '나이';

/** 못 읽으면 '-'. 0이나 빈칸으로 두면 나이가 0살인 사람과 구별되지 않는다. */
export function ageOf(jumin: unknown, baseDate: Date = new Date()): string {
  const age = calculateInsuranceAge(String(jumin ?? ''), baseDate);
  // calculateInsuranceAge는 못 읽으면 -1을 준다.
  return age < 0 ? '-' : String(age);
}

/**
 * 전화번호 열인가.
 *
 * findRequiredColumns는 중복 판정에 쓸 한 열(Tel2)만 골라 준다. 여기서는
 * 화면에 늘어선 전화번호를 **전부** 옮겨야 하므로 따로 가린다.
 */
function isPhoneColumn(header: string): boolean {
  const h = String(header ?? '').toLowerCase().trim();
  return (
    /^tel\d*$/.test(h) ||
    h === 'phone' ||
    h.includes('전화번호') ||
    h.includes('연락처') ||
    h.includes('휴대폰') ||
    h.includes('핸드폰')
  );
}

/** 화면에 표를 어떻게 세울지. 미리보기 창과 수동배정 표가 같은 것을 쓴다. */
export interface PreviewPlan {
  /** 보여줄 순서. 값은 원본 열 번호다 — 정렬은 이 번호로 해야 행과 어긋나지 않는다. */
  order: number[];
  /** order의 이 자리에 나이를 끼운다. -1이면 나이 열이 없다. */
  ageAt: number;
  /** 나이를 계산할 원본 열 번호. -1이면 생년월일 열이 없다. */
  juminAt: number;
}

export function previewPlan(headers: string[]): PreviewPlan {
  const cols = findRequiredColumns(headers);
  const juminAt = cols.juminCol ? headers.indexOf(cols.juminCol) : -1;
  const addressAt = cols.addressCol ? headers.indexOf(cols.addressCol) : -1;

  const phones: number[] = [];
  const rest: number[] = [];
  headers.forEach((header, at) => {
    if (isPhoneColumn(header)) phones.push(at);
    else rest.push(at);
  });

  // 주소 열이 없으면 맨 앞에 둔다. 나이를 아예 안 보여줄 이유는 없다.
  if (addressAt < 0) {
    return { order: [...phones, ...rest], ageAt: juminAt < 0 ? -1 : 0, juminAt };
  }

  const cut = rest.indexOf(addressAt) + 1;
  return {
    order: [...rest.slice(0, cut), ...phones, ...rest.slice(cut)],
    ageAt: juminAt < 0 ? -1 : cut,
    juminAt,
  };
}

/**
 * @param headers 원본 열 이름
 * @param rows    headers 순서에 맞춘 행들
 * @returns 나이를 넣고 전화번호를 그 뒤로 옮긴 열과 행.
 */
export function withAgeColumn(
  headers: string[],
  rows: any[][],
  baseDate: Date = new Date()
): { headers: string[]; rows: any[][] } {
  const plan = previewPlan(headers);

  const lay = <T,>(source: T[], age: T): T[] => {
    const out = plan.order.map((at) => source[at]);
    if (plan.ageAt >= 0) out.splice(plan.ageAt, 0, age);
    return out;
  };

  return {
    headers: lay(headers, AGE_COLUMN),
    rows: rows.map((row) => lay(row, plan.juminAt < 0 ? '-' : ageOf(row[plan.juminAt], baseDate))),
  };
}
