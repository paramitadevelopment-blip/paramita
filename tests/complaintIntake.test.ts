import { describe, it, expect } from 'vitest';
import { readComplaintInput } from '@/lib/complaintIntake';

/**
 * 민원 접수 입력 검사.
 *
 * 메일에 오는 표의 칸이 그대로 여덟이라, 하나라도 비면 옮겨 적다 건너뛴 것이다.
 * 받는 지사·설계사는 그 빈칸을 채울 방법이 없다 — 원본은 메일에만 있다.
 *
 * 화면에서도 막지만 여기서 다시 본다. 요청은 화면을 거치지 않고도 만들 수 있다.
 */

const FULL = {
  product: '흥국화재(든든한3N5)_상담예약(보관에어프라이어)',
  customerName: '이덕임',
  phone: '010-4753-8173',
  orderNo: '20667021',
  receivedAt: '2026-07-08',
  orderConfirmedAt: '2026-07-09',
  calledAt: '2026-08-31T16:04',
  callMemo: '사은품 배송일정 확인후 연락요청',
};

describe('여덟 칸이 다 있어야 한다', () => {
  it('다 채우면 통과한다', () => {
    const result = readComplaintInput(FULL);
    expect(result.ok).toBe(true);
  });

  const labels: Array<[keyof typeof FULL, string]> = [
    ['product', '주문 대표상품'],
    ['customerName', '수령인 이름'],
    ['phone', '전화번호'],
    ['orderNo', '주문번호'],
    ['receivedAt', '접수일자'],
    ['orderConfirmedAt', '발주확인일'],
    ['calledAt', '통화일시'],
    ['callMemo', '통화내역'],
  ];

  /** 어느 칸이 비었는지 이름을 짚어 줘야 한다 — 여덟 칸을 다시 훑게 하면 안 된다. */
  for (const [key, label] of labels) {
    it(`${label}이(가) 비면 그 이름을 알려준다`, () => {
      const result = readComplaintInput({ ...FULL, [key]: '' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain(label);
    });
  }

  it('공백만 넣은 것도 빈 것으로 본다', () => {
    const result = readComplaintInput({ ...FULL, customerName: '   ' });
    expect(result.ok).toBe(false);
  });

  it('날짜가 아닌 값은 안 넣은 것과 같다', () => {
    const result = readComplaintInput({ ...FULL, receivedAt: '어제' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('접수일자');
  });
});

describe('길이', () => {
  it('이름이 너무 길면 막는다', () => {
    const result = readComplaintInput({ ...FULL, customerName: '가'.repeat(51) });
    expect(result.ok).toBe(false);
  });

  it('통화내역이 너무 길면 막는다', () => {
    const result = readComplaintInput({ ...FULL, callMemo: '가'.repeat(2001) });
    expect(result.ok).toBe(false);
  });
});

/**
 * 날짜만 있는 값을 그냥 new Date()에 넣으면 UTC 자정으로 읽혀 한국에서는
 * 전날이 된다. 접수일자가 하루 밀리면 직전 배정을 찾는 기준도 함께 밀린다.
 */
describe('날짜는 그 날의 현지 자정으로 읽는다', () => {
  it('접수일자가 하루 밀리지 않는다', () => {
    const result = readComplaintInput(FULL);
    if (!result.ok) throw new Error('통과해야 한다');
    expect(result.fields.receivedAt?.getFullYear()).toBe(2026);
    expect(result.fields.receivedAt?.getMonth()).toBe(6); // 7월
    expect(result.fields.receivedAt?.getDate()).toBe(8);
  });

  it('통화일시는 시각까지 읽는다', () => {
    const result = readComplaintInput(FULL);
    if (!result.ok) throw new Error('통과해야 한다');
    expect(result.fields.calledAt?.getHours()).toBe(16);
    expect(result.fields.calledAt?.getMinutes()).toBe(4);
  });
});
