import { describe, it, expect } from 'vitest';
import { parseComplaintPaste, PASTE_HEADERS } from '@/lib/complaintPaste';

/**
 * 메일 표를 붙여넣어 읽어내기.
 *
 * 여기서 칸이 하나 밀리면 전화번호 자리에 날짜가 들어간 채로 등록된다.
 * 그래서 '못 읽으면 버린다'가 '대충 채운다'보다 낫다.
 */

const 두줄_탭 = [
  PASTE_HEADERS.join('\t'),
  '흥국화재(든든한3N5)_상담예약(보관에어프라이어)\t이덕임\t010-4753-8173\t2026-07-08\t2026-07-09\t사은품 배송일정 확인후 연락요청\t20667021\t2026-08-31 16:04',
  '흥국화재(든든한3N5)_상담예약(보관에어프라이어)\t홍현정\t010-5134-7138\t2026-08-20\t2026-08-21\t상담전, 급통화요청\t20830410\t2026-08-31 17:21',
].join('\n');

const 한줄씩 = [
  ...PASTE_HEADERS,
  '흥국화재(든든한3N5)_상담예약(보관에어프라이어)',
  '이덕임',
  '010-4753-8173',
  '2026-07-08',
  '2026-07-09',
  '사은품 배송일정 확인후 연락요청',
  '20667021',
  '2026-08-31 16:04',
].join('\n');

describe('엑셀·표에서 복사한 모양 (탭으로 나뉜 줄)', () => {
  it('머리글을 빼고 두 줄을 읽는다', () => {
    const { rows, problems, skipped } = parseComplaintPaste(두줄_탭);
    expect(rows).toHaveLength(2);
    expect(problems).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it('칸이 제자리에 들어간다', () => {
    const { rows } = parseComplaintPaste(두줄_탭);
    expect(rows[0]).toMatchObject({
      product: '흥국화재(든든한3N5)_상담예약(보관에어프라이어)',
      customerName: '이덕임',
      phone: '010-4753-8173',
      receivedAt: '2026-07-08',
      orderConfirmedAt: '2026-07-09',
      callMemo: '사은품 배송일정 확인후 연락요청',
      orderNo: '20667021',
      calledAt: '2026-08-31T16:04',
    });
    expect(rows[1].customerName).toBe('홍현정');
  });

  it('머리글이 없어도 읽는다', () => {
    const 머리글없이 = 두줄_탭.split('\n').slice(1).join('\n');
    expect(parseComplaintPaste(머리글없이).rows).toHaveLength(2);
  });
});

describe('웹 화면의 표에서 복사한 모양 (한 칸씩 줄바꿈)', () => {
  it('여덟 줄을 한 건으로 묶는다', () => {
    const { rows, problems } = parseComplaintPaste(한줄씩);
    expect(rows).toHaveLength(1);
    expect(problems).toHaveLength(0);
    expect(rows[0].customerName).toBe('이덕임');
    expect(rows[0].calledAt).toBe('2026-08-31T16:04');
  });

  it('빈 줄이 섞여 있어도 칸이 밀리지 않는다', () => {
    const 빈줄섞임 = 한줄씩.split('\n').join('\n\n');
    expect(parseComplaintPaste(빈줄섞임).rows[0].orderNo).toBe('20667021');
  });
});

describe('날짜 모양이 달라도 맞춰 준다', () => {
  const 한줄 = (received: string, called: string) =>
    ['상품', '홍길동', '01011112222', received, '2026-07-09', '내용', 'A1', called].join('\t');

  it('점·빗금으로 적힌 날짜', () => {
    expect(parseComplaintPaste(한줄('2026.07.08', '2026/08/31 16:04')).rows[0]).toMatchObject({
      receivedAt: '2026-07-08',
      calledAt: '2026-08-31T16:04',
    });
  });

  it('한 자리 월·일도 두 자리로', () => {
    expect(parseComplaintPaste(한줄('2026-7-8', '2026-8-3 9:05')).rows[0]).toMatchObject({
      receivedAt: '2026-07-08',
      calledAt: '2026-08-03T09:05',
    });
  });

  it('초까지 있으면 분까지만 쓴다', () => {
    expect(parseComplaintPaste(한줄('2026-07-08', '2026-08-31 16:04:59')).rows[0].calledAt).toBe(
      '2026-08-31T16:04'
    );
  });

  /** 전화번호는 다른 화면과 같은 모양으로 저장되어야 나중에 찾을 때 헷갈리지 않는다. */
  it('전화번호에 하이픈을 넣는다', () => {
    expect(parseComplaintPaste(한줄('2026-07-08', '2026-08-31 16:04')).rows[0].phone).toBe(
      '010-1111-2222'
    );
  });
});

describe('잘못 붙여넣은 것', () => {
  it('칸이 모자라면 버리고 몇 개를 버렸는지 알린다', () => {
    const 모자람 = '상품\t홍길동\t010-1111-2222\t2026-07-08';
    const { rows, skipped } = parseComplaintPaste(모자람);
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  /**
   * 읽히긴 했지만 빈 칸이 있는 줄. 버리지 않고 몇 번째가 왜 안 되는지 알린다 —
   * 버리면 사람은 그 줄이 사라진 것도 모른다.
   */
  it('빈 칸이 있으면 문제로 짚어 준다', () => {
    const 빈칸 = ['상품', '홍길동', '010-1111-2222', '2026-07-08', '2026-07-09', '내용', '', '2026-08-31 16:04'].join('\t');
    const { rows, problems } = parseComplaintPaste(빈칸);
    expect(rows).toHaveLength(1);
    expect(problems).toHaveLength(1);
    expect(problems[0].at).toBe(1);
    expect(problems[0].reason).toContain('주문번호');
  });

  it('아무것도 없으면 빈 결과', () => {
    expect(parseComplaintPaste('').rows).toHaveLength(0);
    expect(parseComplaintPaste('   \n  \n').rows).toHaveLength(0);
  });
});
