import { describe, it, expect } from 'vitest';
import { isBlankRow } from '@/lib/excelCell';
import { isOrderNumberMissing } from '@/lib/insurance';

/**
 * 엑셀에서 행을 지운 자리에 공백 한 칸이 남는 일이 흔하다. 셀에 값이 있으니
 * 시트 범위가 그 행까지 늘어나고, 읽는 쪽에는 멀쩡한 데이터 행으로 보인다.
 *
 * 그대로 두면 "주문번호 없음"으로 배포가 막히는데 화면에는 아무것도 안 보여서
 * 관리자가 원인을 찾을 수 없다. 실제로 그 일이 있었다.
 */

describe('유령 행 가려내기', () => {
  it('공백 한 칸만 든 행은 빈 행이다 — 실제로 배포를 막았던 모양', () => {
    // 업체명 칸에만 스페이스 하나가 남은 행
    const 유령 = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', ' ', '', ''];
    expect(isBlankRow(유령)).toBe(true);
  });

  it('빈 문자열만 든 행도 빈 행이다', () => {
    expect(isBlankRow(['', '', ''])).toBe(true);
    expect(isBlankRow([])).toBe(true);
  });

  it('탭·줄바꿈만 있어도 빈 행이다', () => {
    expect(isBlankRow(['\t', '\n', '  '])).toBe(true);
  });

  it('값이 하나라도 있으면 빈 행이 아니다', () => {
    expect(isBlankRow(['', '', '20796750'])).toBe(false);
    expect(isBlankRow(['', 0, ''])).toBe(false);
  });

  it('classify가 읽는 객체 모양도 같은 규칙으로 본다', () => {
    expect(isBlankRow({ 업체명: ' ', 고객명: '', 주문번호: '' })).toBe(true);
    expect(isBlankRow({ 업체명: '', 주문번호: '20796750' })).toBe(false);
  });

  it('날짜 칸만 있는 행은 살린다 — Date는 문자열로 재면 안 된다', () => {
    expect(isBlankRow(['', new Date(2026, 7, 25), ''])).toBe(false);
  });

  it('null·undefined는 빈 행으로 본다', () => {
    expect(isBlankRow(null)).toBe(true);
    expect(isBlankRow(undefined)).toBe(true);
    expect(isBlankRow([null, undefined, ''])).toBe(true);
  });
});

/**
 * 유령 행을 거른다고 해서 진짜 주문번호 누락까지 봐주면 안 된다.
 * 그건 내보낸 뒤 어느 행이었는지 되짚을 수 없어 배포를 막아야 하는 건이다.
 */
describe('진짜 주문번호 누락은 그대로 막는다', () => {
  it('다른 칸에 값이 있으면 빈 행이 아니라 주문번호 누락이다', () => {
    const 주문번호없는행 = ['', '동양생명', '김철수', '01011112222', ''];
    expect(isBlankRow(주문번호없는행)).toBe(false);
    expect(isOrderNumberMissing(주문번호없는행[4])).toBe(true);
  });

  it('주문번호가 공백뿐이어도 누락으로 본다', () => {
    expect(isOrderNumberMissing('   ')).toBe(true);
    expect(isOrderNumberMissing('20796750')).toBe(false);
  });
});
