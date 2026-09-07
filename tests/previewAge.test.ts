import { describe, it, expect } from 'vitest';
import { withAgeColumn, ageOf, previewPlan, AGE_COLUMN } from '@/lib/previewAge';
import { calculateInsuranceAge } from '@/lib/insurance';

/**
 * 분류 화면에만 붙는 나이 열.
 *
 * 가장 중요한 것은 **배정이 본 나이와 같아야 한다**는 것이다. 화면에 다른
 * 나이가 뜨면 "70세 미만인데 왜 저 지사로 갔지"가 생긴다.
 */
const BASE = new Date(2026, 8, 4); // 2026-09-04

describe('나이 열', () => {
  it('배정이 쓰는 보험나이와 같은 값이다', () => {
    const jumin = '550101-1';
    expect(ageOf(jumin, BASE)).toBe(String(calculateInsuranceAge(jumin, BASE)));
  });

  /*
   * 배정은 주소(지역)와 나이로 갈린다. 둘이 붙어 있어야 "이 주소, 이 나이라
   * 이 소속"이 한 눈에 읽힌다.
   */
  it('주소 바로 오른쪽에 붙는다 — 원본 열 순서는 그대로다', () => {
    const headers = ['고객명', '주소', '생년월일성별'];
    const rows = [['홍길동', '서울 강남구', '550101-1']];
    const out = withAgeColumn(headers, rows, BASE);

    expect(out.headers).toEqual(['고객명', '주소', AGE_COLUMN, '생년월일성별']);
    expect(out.rows[0][1]).toBe('서울 강남구');
    expect(out.rows[0][2]).toBe(String(calculateInsuranceAge('550101-1', BASE)));
    // 나이만 빼면 원본 그대로다.
    expect(out.rows[0].filter((_, i) => i !== 2)).toEqual(rows[0]);
  });

  it('주소 열이 없으면 맨 앞에 붙는다', () => {
    const headers = ['고객명', '생년월일성별'];
    const rows = [['홍길동', '550101-1']];
    const out = withAgeColumn(headers, rows, BASE);

    expect(out.headers[0]).toBe(AGE_COLUMN);
  });

  it('생년월일 열이 없으면 아무것도 붙이지 않는다', () => {
    const headers = ['고객명', '주소'];
    const rows = [['홍길동', '서울']];
    const out = withAgeColumn(headers, rows, BASE);

    expect(out.headers).toEqual(headers);
    expect(out.rows).toEqual(rows);
  });

  /* 0살과 구별돼야 한다. 빈칸이나 0으로 두면 둘이 같아 보인다. */
  it('읽을 수 없는 값은 하이픈이다', () => {
    expect(ageOf('', BASE)).toBe('-');
    expect(ageOf('없음', BASE)).toBe('-');
    expect(ageOf(null, BASE)).toBe('-');
  });

  it('행마다 제 생년월일로 계산한다', () => {
    const headers = ['생년월일성별', '고객명'];
    const rows = [
      ['550101-1', '가'],
      ['900101-2', '나'],
      ['', '다'],
    ];
    const out = withAgeColumn(headers, rows, BASE);

    // 주소 열이 없으므로 맨 앞이다.
    expect(out.rows[0][0]).toBe(String(calculateInsuranceAge('550101-1', BASE)));
    expect(out.rows[1][0]).toBe(String(calculateInsuranceAge('900101-2', BASE)));
    expect(out.rows[2][0]).toBe('-');
  });
});

/**
 * 전화번호는 나이 뒤로 물린다.
 *
 * 원래 양식은 고객명·Tel1·Tel2·우편번호·주소 순이라, 배정을 판단하는 두 값
 * (주소·나이) 사이에 전화번호가 끼어 눈이 건너뛰어야 했다.
 */
describe('열 순서', () => {
  const HEADERS = [
    '상품명',
    '고객명',
    'Tel1',
    'Tel2',
    '우편번호',
    '주소',
    '생년월일성별',
    '주문번호',
  ];
  const ROW = ['가전', '홍길동', '010-1111-2222', '010-3333-4444', '12345', '서울 강남구', '550101-1', 'A-1'];

  it('주소 · 나이 · 전화번호 순으로 선다', () => {
    const out = withAgeColumn(HEADERS, [ROW], BASE);
    expect(out.headers).toEqual([
      '상품명',
      '고객명',
      '우편번호',
      '주소',
      AGE_COLUMN,
      'Tel1',
      'Tel2',
      '생년월일성별',
      '주문번호',
    ]);
  });

  it('값도 열 이름과 같이 따라간다', () => {
    const out = withAgeColumn(HEADERS, [ROW], BASE);
    const at = (name: string) => out.rows[0][out.headers.indexOf(name)];

    expect(at('주소')).toBe('서울 강남구');
    expect(at(AGE_COLUMN)).toBe(String(calculateInsuranceAge('550101-1', BASE)));
    expect(at('Tel1')).toBe('010-1111-2222');
    expect(at('Tel2')).toBe('010-3333-4444');
    expect(at('고객명')).toBe('홍길동');
  });

  it('열을 잃지도 늘리지도 않는다', () => {
    const out = withAgeColumn(HEADERS, [ROW], BASE);
    expect(out.headers).toHaveLength(HEADERS.length + 1);
    expect([...out.headers].sort()).toEqual([...HEADERS, AGE_COLUMN].sort());
  });
});

describe('화면 순서 계획', () => {
  it('order는 원본 열 번호다 — 정렬이 어긋나지 않으려면 그래야 한다', () => {
    const headers = ['고객명', 'Tel1', '주소', '생년월일성별'];
    const plan = previewPlan(headers);

    // 고객명(0) · 주소(2) · [나이] · Tel1(1) · 생년월일성별(3)
    expect(plan.order).toEqual([0, 2, 1, 3]);
    expect(plan.ageAt).toBe(2);
    expect(plan.juminAt).toBe(3);
  });

  it('생년월일 열이 없으면 나이 자리도 없다', () => {
    const plan = previewPlan(['고객명', '주소']);
    expect(plan.ageAt).toBe(-1);
    expect(plan.juminAt).toBe(-1);
  });
});
