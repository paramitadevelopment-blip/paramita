import { describe, it, expect } from 'vitest';
import { matchComplaint, type MatchRecord } from '@/lib/complaintMatch';

/**
 * 민원을 어느 지사로 넘길지.
 *
 * 여기서 틀리면 남의 고객 민원이 엉뚱한 지사로 간다. 되짚을 방법이 없고
 * 고객 정보가 관계없는 지사에 노출되므로, 못 찾는 편이 잘못 찾는 것보다 낫다.
 */

const day = (iso: string) => new Date(iso + 'T00:00:00');

function record(over: Partial<MatchRecord> = {}): MatchRecord {
  return {
    name: '이덕임',
    tel1: '010-4753-8173',
    tel2: '',
    assignedTo: '파라인슈',
    orderNo: '20667021',
    receivedAt: day('2026-07-08'),
    assignedAt: day('2026-07-09'),
    uploadedAt: day('2026-07-09'),
    fileId: 'file-1',
    fileName: '0708.xlsx',
    ...over,
  };
}

const target = {
  orderNo: '20667021',
  name: '이덕임',
  phone: '010-4753-8173',
  receivedAt: day('2026-07-08'),
};

describe('주문번호가 먼저다', () => {
  it('주문번호가 같으면 그 건이 간 지사로', () => {
    const match = matchComplaint(target, [record()]);
    expect(match).toMatchObject({ dept: '파라인슈', matchKey: 'order_no' });
  });

  /** 이름이 달라도 주문번호가 같으면 같은 신청 건이다 — 수령인만 다르게 적힐 수 있다. */
  it('이름이 달라도 주문번호가 같으면 찾는다', () => {
    const match = matchComplaint(target, [record({ name: '이덕임(모)' })]);
    expect(match?.matchKey).toBe('order_no');
  });

  /**
   * 같은 주문번호가 두 줄이면 하나는 '중복 제외'로 빠져 있다.
   * 그 줄에는 알려줄 지사가 없으므로 배정된 줄을 봐야 한다.
   */
  it('중복 제외된 줄은 건너뛴다', () => {
    const match = matchComplaint(target, [
      record({ assignedTo: '중복 제외', uploadedAt: day('2026-07-20') }),
      record({ assignedTo: '한울부원' }),
    ]);
    expect(match?.dept).toBe('한울부원');
  });

  it('블랙리스트로 빠진 줄도 건너뛴다', () => {
    const match = matchComplaint(target, [record({ assignedTo: '블랙리스트' })]);
    expect(match).toBeNull();
  });
});

describe('주문번호로 못 찾으면 이름 + 전화번호', () => {
  it('주문번호가 비어 있어도 찾는다', () => {
    const match = matchComplaint(
      { ...target, orderNo: '' },
      [record({ orderNo: '' })]
    );
    expect(match).toMatchObject({ dept: '파라인슈', matchKey: 'name_phone' });
  });

  it('우리 기록의 주문번호가 다르면 이름·전화번호로 넘어간다', () => {
    const match = matchComplaint(target, [record({ orderNo: '99999999' })]);
    expect(match?.matchKey).toBe('name_phone');
  });

  /** 사람이 하이픈을 넣거나 빼서 적는다. 같은 번호로 봐야 한다. */
  it('하이픈이 있든 없든 같은 번호다', () => {
    const match = matchComplaint(
      { ...target, orderNo: '', phone: '01047538173' },
      [record({ orderNo: '', tel1: '010-4753-8173' })]
    );
    expect(match?.matchKey).toBe('name_phone');
  });

  /** Tel1·Tel2 중 어느 칸에 넣었는지는 사람마다 다르다. */
  it('Tel2에 적혀 있어도 찾는다', () => {
    const match = matchComplaint(
      { ...target, orderNo: '' },
      [record({ orderNo: '', tel1: '02-1234-5678', tel2: '010-4753-8173' })]
    );
    expect(match?.matchKey).toBe('name_phone');
  });

  it('이름이 같아도 번호가 다르면 다른 사람이다', () => {
    const match = matchComplaint(
      { ...target, orderNo: '' },
      [record({ orderNo: '', tel1: '010-0000-0000', tel2: '' })]
    );
    expect(match).toBeNull();
  });

  /**
   * 8월 민원인데 9월에 다시 신청해서 다른 지사로 갔다면, 그 민원은 8월에 받은
   * 지사 것이다. 나중 건을 집으면 민원과 무관한 지사로 간다.
   */
  it('민원 접수일보다 나중에 신청된 건은 보지 않는다', () => {
    const match = matchComplaint({ ...target, orderNo: '' }, [
      record({ orderNo: '', assignedTo: '경기', receivedAt: day('2026-07-01') }),
      record({ orderNo: '', assignedTo: '한울부원', receivedAt: day('2026-08-20') }),
    ]);
    expect(match?.dept).toBe('경기');
  });
});

describe('못 찾는 경우', () => {
  it('기록에 없는 고객이면 null — 관리자가 직접 정한다', () => {
    expect(matchComplaint(target, [])).toBeNull();
  });

  it('이름이 비어 있으면 찾지 않는다', () => {
    expect(matchComplaint({ ...target, orderNo: '', name: '' }, [record({ orderNo: '' })])).toBeNull();
  });

  it('전화번호가 비어 있으면 찾지 않는다', () => {
    expect(matchComplaint({ ...target, orderNo: '', phone: '' }, [record({ orderNo: '' })])).toBeNull();
  });
});
