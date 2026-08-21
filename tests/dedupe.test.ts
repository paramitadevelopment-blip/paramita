import { describe, it, expect } from 'vitest';
import {
  dedupeByOrderNumber,
  dedupeByCustomerKey,
  normalizePhone,
  normalizeProductName,
  isExcludedColumn,
} from '@/lib/insurance';

/**
 * 중복 제거 검증.
 * 과하게 지우면 진짜 고객이 사라지고, 덜 지우면 같은 사람에게 두 번 연락이 간다.
 * 둘 다 되돌리기 어려운 실수라 경계를 분명히 해둔다.
 */

type Row = { order?: unknown; name?: unknown; phone?: unknown; product?: unknown; tag: string };

const byOrder = (rows: Row[]) => dedupeByOrderNumber(rows, (r) => r.order);
const byCustomer = (rows: Row[]) =>
  dedupeByCustomerKey(rows, (r) => r.name, (r) => r.phone, (r) => r.product);

describe('주문번호 중복 제거', () => {
  it('먼저 나온 행을 남기고 뒤엣것을 버린다', () => {
    const { items, removed } = byOrder([
      { order: '1001', tag: 'first' },
      { order: '1001', tag: 'second' },
      { order: '1002', tag: 'other' },
    ]);

    expect(items.map((r) => r.tag)).toEqual(['first', 'other']);
    expect(removed.map((r) => r.tag)).toEqual(['second']);
  });

  it('대소문자는 같은 것으로 본다', () => {
    const { removed } = byOrder([
      { order: 'A100', tag: 'first' },
      { order: 'a100', tag: 'second' },
    ]);
    expect(removed).toHaveLength(1);
  });

  it('앞뒤 공백은 무시한다', () => {
    const { removed } = byOrder([
      { order: ' 1001 ', tag: 'first' },
      { order: '1001', tag: 'second' },
    ]);
    expect(removed).toHaveLength(1);
  });

  it('주문번호가 비면 중복 판정 없이 전부 살린다', () => {
    // 근거가 없는데 지우면 멀쩡한 건이 사라진다
    const { items, removed } = byOrder([
      { order: '', tag: 'a' },
      { order: '', tag: 'b' },
      { order: null, tag: 'c' },
      { order: undefined, tag: 'd' },
    ]);
    expect(items).toHaveLength(4);
    expect(removed).toHaveLength(0);
  });

  it('숫자와 문자열은 같은 값으로 본다', () => {
    // 엑셀에서 같은 칸이 숫자로도 문자로도 읽힌다
    const { removed } = byOrder([
      { order: 1001, tag: 'num' },
      { order: '1001', tag: 'str' },
    ]);
    expect(removed).toHaveLength(1);
  });
});

describe('고객 중복 제거 (전화 + 이름 + 상품)', () => {
  const base = { name: '김철수', phone: '010-1234-5678', product: '동양생명 실손보험' };

  it('세 값이 모두 같아야 중복이다', () => {
    const { items, removed } = byCustomer([
      { ...base, tag: 'first' },
      { ...base, tag: 'second' },
    ]);
    expect(items.map((r) => r.tag)).toEqual(['first']);
    expect(removed.map((r) => r.tag)).toEqual(['second']);
  });

  it('상품이 다르면 같은 사람이라도 살린다', () => {
    // 한 사람이 실손과 암보험에 둘 다 가입할 수 있다
    const { items } = byCustomer([
      { ...base, product: '동양생명 실손보험', tag: 'silson' },
      { ...base, product: '동양생명 암보험', tag: 'am' },
    ]);
    expect(items).toHaveLength(2);
  });

  it('전화번호 표기가 달라도 같은 번호면 중복이다', () => {
    const { removed } = byCustomer([
      { ...base, phone: '010-1234-5678', tag: 'dash' },
      { ...base, phone: '01012345678', tag: 'plain' },
    ]);
    expect(removed).toHaveLength(1);
  });

  it('상품명의 공백·대소문자 흔들림은 같은 것으로 본다', () => {
    const { removed } = byCustomer([
      { ...base, product: '동양생명  실손보험', tag: 'double space' },
      { ...base, product: ' 동양생명 실손보험 ', tag: 'padded' },
    ]);
    expect(removed).toHaveLength(1);
  });

  it('세 값 중 하나라도 비면 판단 근거가 없으므로 살린다', () => {
    const { items, removed } = byCustomer([
      { name: '', phone: '01012345678', product: 'A', tag: 'no name' },
      { name: '김철수', phone: '', product: 'A', tag: 'no phone' },
      { name: '김철수', phone: '01012345678', product: '', tag: 'no product' },
      { name: '', phone: '', product: '', tag: 'empty' },
      { name: '', phone: '', product: '', tag: 'empty2' },
    ]);
    expect(items).toHaveLength(5);
    expect(removed).toHaveLength(0);
  });

  it('이름만 같고 번호가 다르면 다른 사람이다', () => {
    const { items } = byCustomer([
      { ...base, phone: '010-1111-1111', tag: 'a' },
      { ...base, phone: '010-2222-2222', tag: 'b' },
    ]);
    expect(items).toHaveLength(2);
  });
});

describe('정규화 함수', () => {
  it('전화번호는 숫자만 남긴다', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(normalizePhone('010 1234 5678')).toBe('01012345678');
    expect(normalizePhone('(010)1234-5678')).toBe('01012345678');
    expect(normalizePhone(null)).toBe('');
  });

  it('상품명은 공백과 대소문자를 맞춘다', () => {
    expect(normalizeProductName('  ABC   보험 ')).toBe('abc 보험');
    expect(normalizeProductName(null)).toBe('');
  });
});

describe('배포 제외 컬럼', () => {
  it('내부 관리용 열은 뺀다', () => {
    for (const h of ['구분', '방송사명', '주문상태', '업체명', '비고']) {
      expect(isExcludedColumn(h)).toBe(true);
    }
  });

  it('헤더가 비었거나 __EMPTY면 뺀다', () => {
    expect(isExcludedColumn('')).toBe(true);
    expect(isExcludedColumn('   ')).toBe(true);
    expect(isExcludedColumn('__EMPTY')).toBe(true);
    expect(isExcludedColumn('__EMPTY_1')).toBe(true);
  });

  it('고객에게 나가야 하는 열은 남긴다', () => {
    for (const h of ['고객명', '연락처', '주소', '상품명', '주문번호']) {
      expect(isExcludedColumn(h)).toBe(false);
    }
  });
});
