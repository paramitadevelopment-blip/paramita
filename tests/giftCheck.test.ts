import { describe, it, expect } from 'vitest';
import {
  canDeleteGiftRequest,
  canEditGiftRequest,
  needsAdminCheck,
  validateGiftInput,
  GIFT_STATUSES,
  GIFT_STATUS_LABEL,
} from '@/lib/gifts';

/**
 * 같은 주문번호 재신청 — 관리자 확인 대기.
 *
 * 한 주문번호로 여러 상품을 가입하거나 사은품을 추가로 달라는 일이 있어 막지는
 * 않는다. 대신 왜 또 보내는지를 적게 하고, 관리자가 확인해야 담당자에게 간다.
 * 주문번호가 없거나 기록에 없는 건은 앞단에서 거절한다.
 */

/** 신청서 한 벌. 검사에 필요한 칸만 채운다. */
const form = (over: Record<string, unknown> = {}) => ({
  orderNo: 'ORD-1',
  address: '경기 시흥시 대야로 46',
  giftName: '보관에어프라이어',
  quantity: 1,
  senderName: '한울부원지사',
  senderPhone: '010-3408-5120',
  product: '흥국화재(든든한3N5)_상담예약(보관에어프라이어)',
  ...over,
});

describe('주문번호와 재신청 사유', () => {
  it('주문번호는 반드시 있어야 한다 — 기록을 찾을 열쇠다', () => {
    expect(validateGiftInput(form({ orderNo: '' }))).toMatch(/주문번호/);
    expect(validateGiftInput(form({ orderNo: '   ' }))).toMatch(/주문번호/);
  });

  it('주문번호가 있으면 통과한다 — 고객명·전화는 서버가 기록에서 채운다', () => {
    expect(validateGiftInput(form())).toBeNull();
  });

  it('재신청 사유는 비워도 되고(첫 신청), 적었으면 길이를 본다', () => {
    expect(validateGiftInput(form({ checkReason: '' }))).toBeNull();
    expect(validateGiftInput(form({ checkReason: '두 번째 상품 가입' }))).toBeNull();
    expect(validateGiftInput(form({ checkReason: '가'.repeat(501) }))).toMatch(/사유가 너무 깁니다/);
  });
});

describe('확인 대기인 동안의 잠금', () => {
  it('확인 대기는 고칠 수 있다 — 아직 아무도 안 봤다', () => {
    expect(canEditGiftRequest({ status: 'pending_check' })).toBe(true);
  });

  it('확인 대기는 지울 수 있다 — 지사 밖으로 나가지 않았다', () => {
    expect(canDeleteGiftRequest({ status: 'pending_check' })).toBe(true);
  });

  it('확인을 기다리는 건은 확인 대기 상태뿐이다', () => {
    expect(needsAdminCheck({ status: 'pending_check' })).toBe(true);
    for (const status of GIFT_STATUSES.filter((s) => s !== 'pending_check')) {
      expect(needsAdminCheck({ status })).toBe(false);
    }
  });
});

describe('상태 목록', () => {
  it('확인 대기가 첫 자리다 — 신청이 지나는 순서가 곧 탭 순서다', () => {
    expect(GIFT_STATUSES[0]).toBe('pending_check');
    // 등록이 곧 전달이라 '지사 전달 대기'는 없다. 확인 대기 다음이 바로 발주 대기다.
    expect(GIFT_STATUSES[1]).toBe('forwarded');
  });

  it('모든 상태에 이름이 있다', () => {
    for (const status of GIFT_STATUSES) {
      expect(GIFT_STATUS_LABEL[status]).toBeTruthy();
    }
    expect(GIFT_STATUS_LABEL.pending_check).toBe('관리자 확인 대기');
  });
});
