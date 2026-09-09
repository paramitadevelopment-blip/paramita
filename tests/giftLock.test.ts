import { describe, it, expect } from 'vitest';
import {
  canEditGiftRequest,
  canDeleteGiftRequest,
  canWithdrawGiftRequest,
  canShipGiftRequest,
  needsStaffRead,
  validateShipInput,
  needsShipCheck,
  settlementFor,
  prefillFromRecord,
  withBranchSuffix,
  GIFT_STATUSES,
  GIFT_STATUS_LABEL,
} from '@/lib/gifts';

/**
 * 사은품 신청의 잠금. 민원과 같은 규칙이다 —
 * **윗선(담당자)이 아직 아무 행위도 안 했으면 지사가 고칠 수 있다.**
 */
describe('지사가 고칠 수 있는가', () => {
  it('관리자 확인 대기는 된다 — 아직 아무도 안 봤다', () => {
    expect(canEditGiftRequest({ status: 'pending_check' })).toBe(true);
  });

  it('보완 요청을 받은 것(supplement)은 된다 — 고치라고 돌려보낸 것이다', () => {
    expect(canEditGiftRequest({ status: 'supplement', read_at: '2026-09-07T00:00:00Z' })).toBe(true);
  });

  it('등록은 곧 전달이다 — 담당자가 아직 안 봤으면 된다', () => {
    expect(canEditGiftRequest({ status: 'forwarded', read_at: null })).toBe(true);
    expect(canEditGiftRequest({ status: 'forwarded' })).toBe(true);
  });

  it('담당자가 확인한 순간 닫힌다', () => {
    expect(canEditGiftRequest({ status: 'forwarded', read_at: '2026-09-07T00:00:00Z' })).toBe(false);
  });

  it('발주리스트에 담겨 나간 뒤에는 안 된다 — 이미 나간 물건이다', () => {
    expect(canEditGiftRequest({ status: 'ordered' })).toBe(false);
    expect(canEditGiftRequest({ status: 'shipped' })).toBe(false);
  });

  it('철회된 것은 닫힌 것이다', () => {
    expect(canEditGiftRequest({ status: 'withdrawn' })).toBe(false);
  });
});

describe('지우기·철회', () => {
  it('지우기는 담당자가 아직 손대지 않은 것만 — 고치기와 같은 선', () => {
    expect(canDeleteGiftRequest({ status: 'forwarded', read_at: null })).toBe(true);
    expect(canDeleteGiftRequest({ status: 'pending_check' })).toBe(true);
    expect(canDeleteGiftRequest({ status: 'forwarded', read_at: '2026-09-07T00:00:00Z' })).toBe(false);
    expect(canDeleteGiftRequest({ status: 'ordered' })).toBe(false);
  });

  it('보완 요청을 받은 것은 못 지운다 — 지우면 보완 이력까지 사라진다', () => {
    expect(canDeleteGiftRequest({ status: 'supplement' })).toBe(false);
  });

  it('관리자는 상태와 무관하게 지운다 — 사유를 받아 보관본을 남기는 쪽이 서버다', () => {
    for (const status of ['pending_check', 'forwarded', 'ordered', 'shipped', 'supplement', 'withdrawn'] as const) {
      expect(canDeleteGiftRequest({ status, read_at: '2026-09-08T00:00:00Z' }, true)).toBe(true);
    }
  });

  it('관리자 아님을 명시해도 지사 규칙 그대로', () => {
    expect(canDeleteGiftRequest({ status: 'ordered' }, false)).toBe(false);
  });

  it('철회는 보완 요청 받은 것만', () => {
    expect(canWithdrawGiftRequest({ status: 'supplement' })).toBe(true);
    expect(canWithdrawGiftRequest({ status: 'ordered' })).toBe(false);
    expect(canWithdrawGiftRequest({ status: 'forwarded' })).toBe(false);
  });
});

/**
 * 배송 정보는 발주 뒤에 채우는 값이다. 발주일은 묶을 때 찍히므로 여기서 묻지 않는다 —
 * 전에는 셋을 다 필수로 받아 실제 순서와 거꾸로였다.
 */
describe('배송 정보 검사', () => {
  it('택배사·운송장번호만 본다. 발주일은 안 묻는다', () => {
    expect(validateShipInput({ courier: 'CJ대한통운', trackingNo: '1234-5678' })).toBeNull();
    expect(validateShipInput({ courier: 'CJ대한통운', trackingNo: '1234-5678', orderDate: '' })).toBeNull();
  });

  it('택배사가 없으면 막는다', () => {
    expect(validateShipInput({ courier: '', trackingNo: '1234' })).toMatch(/택배사/);
  });

  it('운송장번호가 없으면 막는다', () => {
    expect(validateShipInput({ courier: 'CJ대한통운', trackingNo: '' })).toMatch(/운송장번호/);
  });
});

describe('상태', () => {
  it("'발주 보냄'(ordered)이 발주 대기와 배송 정보 사이에 있다", () => {
    const at = (s: string) => GIFT_STATUSES.indexOf(s as any);
    expect(at('forwarded')).toBeLessThan(at('ordered'));
    expect(at('ordered')).toBeLessThan(at('shipped'));
  });

  it('모든 상태에 라벨이 있다', () => {
    for (const s of GIFT_STATUSES) expect(GIFT_STATUS_LABEL[s]).toBeTruthy();
  });
});

/** 거래처 파일의 보내시는분은 '한울부원지사'다. 조직명에 접미를 맞춘다. */
describe('보내시는분 표기', () => {
  it("'지사'가 없으면 붙인다", () => {
    expect(withBranchSuffix('한울부원')).toBe('한울부원지사');
  });
  it('이미 붙어 있으면 그대로다', () => {
    expect(withBranchSuffix('경기지사')).toBe('경기지사');
  });
  it('빈 값은 빈 값이다', () => {
    expect(withBranchSuffix('')).toBe('');
  });
});

/**
 * 배송 정보 — 담당자가 채우고 지사가 확인한다.
 *
 * 채워지기만 하고 아무도 안 보면 "송장 나왔습니다"가 전달되지 않는다. 민원의
 * '미확인'과 같은 자리를 둬서, 지사가 누르기 전까지 지사의 할 일로 센다.
 */
describe('배송 정보 입력값', () => {
  const ok = { courier: 'CJ대한통운', trackingNo: '1234-5678' };

  it('택배사·운송장번호만 있으면 통과한다 — 나머지는 선택', () => {
    expect(validateShipInput(ok)).toBeNull();
  });

  it('발주일은 비워 둘 수 있다 — 묶을 때 찍힌 날을 그대로 둔다', () => {
    expect(validateShipInput({ ...ok, orderDate: '' })).toBeNull();
  });

  it('발주일을 적었으면 날짜여야 한다', () => {
    expect(validateShipInput({ ...ok, orderDate: '2026-09-05' })).toBeNull();
    expect(validateShipInput({ ...ok, orderDate: '9월 5일' })).toMatch(/발주일/);
    expect(validateShipInput({ ...ok, orderDate: '2026/09/05' })).toMatch(/발주일/);
  });

  it('배송메세지가 너무 길면 막는다', () => {
    expect(validateShipInput({ ...ok, deliveryMemo: '가'.repeat(300) })).toBeNull();
    expect(validateShipInput({ ...ok, deliveryMemo: '가'.repeat(301) })).toMatch(/배송메세지/);
  });
});

describe('지사가 배송 정보를 봤는가', () => {
  it('채워졌는데 안 봤으면 지사의 할 일', () => {
    expect(needsShipCheck({ status: 'shipped', ship_read_at: null })).toBe(true);
    expect(needsShipCheck({ status: 'shipped' })).toBe(true);
  });

  it('확인했으면 내려간다', () => {
    expect(needsShipCheck({ status: 'shipped', ship_read_at: '2026-09-07T00:00:00Z' })).toBe(false);
  });

  it('아직 안 채워진 건은 확인할 것이 없다', () => {
    for (const status of GIFT_STATUSES.filter((s) => s !== 'shipped')) {
      expect(needsShipCheck({ status, ship_read_at: null })).toBe(false);
    }
  });
});

/**
 * 정산구분 — 보내시는분이 누구냐로 갈린다.
 *
 * 거래처가 이 칸을 보고 정산을 가른다. 파라인슈가 보내는 건은 DB를 우리가 준
 * 것이라 'DB포함', 나머지 지사는 '정산해당'이다.
 */
describe('정산구분', () => {
  it('파라인슈가 보내면 DB포함', () => {
    expect(settlementFor('파라인슈지사')).toBe('DB포함');
    expect(settlementFor('파라인슈')).toBe('DB포함');
  });

  it('다른 지사는 정산해당', () => {
    expect(settlementFor('한울부원지사')).toBe('정산해당');
    expect(settlementFor('굿모닝제너럴지사')).toBe('정산해당');
    expect(settlementFor('경기지사')).toBe('정산해당');
  });

  it('보내시는분이 비어 있으면 정산해당 — 기본값이 없는 것보다 낫다', () => {
    expect(settlementFor('')).toBe('정산해당');
  });

  it('신청서 기본값도 보내는 쪽을 따른다', () => {
    const record = { 고객명: '김민원', Tel1: '010-1111-2222', 상품명: '동양생명(보관에어프라이어)' };
    const file = { id: 'f1', name: '배포.xlsx' };
    const para = prefillFromRecord(record, file, { name: '신청자', groupName: '파라인슈' });
    expect(para.fields.senderName).toBe('파라인슈지사');
    expect(para.fields.settlement).toBe('DB포함');

    const other = prefillFromRecord(record, file, { name: '신청자', groupName: '한울부원' });
    expect(other.fields.settlement).toBe('정산해당');
  });
});

/**
 * 상세를 여는 것이 곧 확인이다. 담당자가 발주 대기 건을 열면 확인이 찍힌다 —
 * 이 함수는 "열었을 때 찍어야 하는가"를 가른다.
 */
describe('담당자가 열면 확인을 찍어야 하는가', () => {
  it('발주 대기이고 아직 안 봤으면 찍는다', () => {
    expect(needsStaffRead({ status: 'forwarded', read_at: null })).toBe(true);
    expect(needsStaffRead({ status: 'forwarded' })).toBe(true);
  });

  it('이미 봤으면 다시 안 찍는다 — 처음 본 시각이 진짜 확인 시각이다', () => {
    expect(needsStaffRead({ status: 'forwarded', read_at: '2026-09-08T00:00:00Z' })).toBe(false);
  });

  it('발주된 뒤·보완·확인 대기는 담당자 확인 자리가 아니다', () => {
    expect(needsStaffRead({ status: 'ordered' })).toBe(false);
    expect(needsStaffRead({ status: 'shipped' })).toBe(false);
    expect(needsStaffRead({ status: 'supplement' })).toBe(false);
    expect(needsStaffRead({ status: 'pending_check' })).toBe(false);
  });
});

/**
 * 배송 정보는 한 번만 적는다. 운송장번호가 나왔다는 것은 이미 발송했다는 뜻이라,
 * 그 뒤에 바꿀 일이 생겼다면 같은 발송의 수정이 아니라 새 발송이다.
 */
describe('배송 정보를 적을 수 있는가', () => {
  it('발주리스트에 담겨 나간 것만 된다', () => {
    expect(canShipGiftRequest({ status: 'ordered' })).toBe(true);
  });

  it('이미 채워진 건은 안 된다 — 물건이 나간 뒤다', () => {
    expect(canShipGiftRequest({ status: 'shipped' })).toBe(false);
  });

  it('발주 전·되돌린 것·닫힌 것도 안 된다', () => {
    for (const status of ['pending_check', 'forwarded', 'supplement', 'withdrawn'] as const) {
      expect(canShipGiftRequest({ status })).toBe(false);
    }
  });
});
