import { describe, it, expect } from 'vitest';
import {
  canDeleteComplaint,
  canEditComplaint,
  canWithdrawComplaint,
  isUntouchedComplaint,
} from '@/lib/complaints';
import type { ComplaintStatus, AssignType } from '@/lib/complaints';

/**
 * 넣은 사람이 고치거나 지울 수 있는 건인가.
 *
 * 화면과 서버가 이 함수를 같이 본다. 여기가 느슨하면 이미 처리된 민원이
 * 조용히 사라지거나, 지사가 보고 판단한 내용이 뒤에서 바뀐다.
 */

function row(over: Partial<Parameters<typeof isUntouchedComplaint>[0]> = {}) {
  return {
    status: 'branch' as ComplaintStatus,
    assign_type: 'auto' as AssignType | null,
    handled_at: null as string | null,
    read_at: null as string | null,
    ...over,
  };
}

describe('아직 아무도 안 건드린 건', () => {
  it('담당 지사를 못 찾아 관리자 앞에 놓인 건', () => {
    expect(isUntouchedComplaint(row({ status: 'unassigned', assign_type: null }))).toBe(true);
  });

  it('자동으로 지사까지만 간 건', () => {
    expect(isUntouchedComplaint(row({ status: 'branch', assign_type: 'auto' }))).toBe(true);
  });
});

describe('다른 사람이 손댄 건은 잠긴다', () => {
  it('관리자가 지사를 직접 지정했으면 잠긴다', () => {
    expect(isUntouchedComplaint(row({ status: 'branch', assign_type: 'manual' }))).toBe(false);
  });

  it('처리가 끝났으면 잠긴다', () => {
    expect(
      isUntouchedComplaint(row({ status: 'done', handled_at: '2026-09-03T00:00:00Z' }))
    ).toBe(false);
  });

  /**
   * 본 순간 그 내용으로 판단이 시작된다 — 전화를 걸었을 수도 있다.
   * 그 뒤에 내용이 바뀌면 지사는 자기가 본 것과 다른 건을 처리하게 된다.
   */
  it('지사가 열어 보기만 해도 잠긴다', () => {
    expect(isUntouchedComplaint(row({ read_at: '2026-09-04T01:00:00Z' }))).toBe(false);
  });

  /**
   * 반려는 "고쳐서 다시 보내라"는 뜻이다. 못 고치게 하면 그 말을 따를 방법이 없다.
   * 지난 반려는 이력에 쌓이므로 고쳐 보내도 왕복한 흔적은 남는다.
   *
   * 다만 **지우기는 다르다.** 민원이 사라지면 거기 딸린 반려 이력도 함께
   * 사라져, 되돌려 보낸 사유가 통째로 없어진다.
   */
  it('반려된 건은 고칠 수 있다 — 그러라고 되돌린 것이다', () => {
    expect(canEditComplaint(row({ status: 'returned' }))).toBe(true);
  });

  it('반려된 건은 지사가 봤던 적이 있어도 고칠 수 있다', () => {
    expect(canEditComplaint(row({ status: 'returned', read_at: '2026-09-04T01:00:00Z' }))).toBe(
      true
    );
  });

  it('반려된 건은 지울 수 없다 — 지우면 반려 사유까지 사라진다', () => {
    expect(canDeleteComplaint(row({ status: 'returned' }))).toBe(false);
  });

  it('반려는 손을 댄 것이다 — 아무도 안 만진 상태로 보지 않는다', () => {
    expect(isUntouchedComplaint(row({ status: 'returned' }))).toBe(false);
  });

  it('아무도 손대지 않은 건은 고치기와 지우기가 모두 열린다', () => {
    const fresh = row({ status: 'unassigned', assign_type: null });
    expect(canEditComplaint(fresh)).toBe(true);
    expect(canDeleteComplaint(fresh)).toBe(true);
  });

  it('처리가 시작된 건은 고치기도 지우기도 막힌다', () => {
    const touched = row({ status: 'branch', read_at: '2026-09-04T01:00:00Z' });
    expect(canEditComplaint(touched)).toBe(false);
    expect(canDeleteComplaint(touched)).toBe(false);
  });

  it('처리 시각이 남아 있으면 상태와 무관하게 잠긴다', () => {
    expect(
      isUntouchedComplaint(row({ status: 'branch', handled_at: '2026-09-03T00:00:00Z' }))
    ).toBe(false);
  });
});

/**
 * 철회. 보완 요청을 받았는데 진행할 필요가 없어진 건을 닫는다.
 *
 * 지우는 것과 다르다 — 민원도 보완 이력도 남고, 배지에서만 빠진다. 그래서
 * 보완 요청을 받은 건에만 열리고, 철회된 뒤에는 고치지도 지우지도 못한다.
 */
describe('철회', () => {
  it('보완 요청을 받은 건만 철회할 수 있다', () => {
    expect(canWithdrawComplaint(row({ status: 'returned' }))).toBe(true);
  });

  it('아무도 손대지 않은 건은 철회가 아니라 삭제다', () => {
    expect(canWithdrawComplaint(row({ status: 'unassigned', assign_type: null }))).toBe(false);
    expect(canWithdrawComplaint(row({ status: 'branch', assign_type: 'auto' }))).toBe(false);
  });

  it('처리 중이거나 끝난 건은 철회할 수 없다', () => {
    expect(canWithdrawComplaint(row({ status: 'done', handled_at: '2026-09-03T00:00:00Z' }))).toBe(false);
  });

  it('철회된 건은 닫힌 것이다 — 고치지도 지우지도 철회하지도 못한다', () => {
    const closed = row({ status: 'withdrawn' });
    expect(canEditComplaint(closed)).toBe(false);
    expect(canDeleteComplaint(closed)).toBe(false);
    expect(canWithdrawComplaint(closed)).toBe(false);
    expect(isUntouchedComplaint(closed)).toBe(false);
  });
});

/**
 * 관리자 삭제.
 *
 * 관리자(admin·subadmin)는 상태와 무관하게 지운다. 잘못 들어간 개인정보나
 * 시험 삼아 넣은 건은 닫아 두는 것으로 안 되고 없애야 한다. 지운 것은 사유와
 * 함께 보관본(deleted_complaints)으로 남으므로 자국이 사라지지는 않는다.
 */
describe('관리자는 상태와 무관하게 지운다', () => {
  const touched = [
    row({ status: 'branch', assign_type: 'manual' }),
    row({ status: 'branch', read_at: '2026-09-08T01:00:00Z' }),
    row({ status: 'done', handled_at: '2026-09-08T02:00:00Z' }),
    row({ status: 'returned' }),
    row({ status: 'withdrawn' }),
  ];

  it('넣은 사람에게는 전부 잠겨 있다', () => {
    for (const one of touched) expect(canDeleteComplaint(one)).toBe(false);
  });

  it('관리자에게는 전부 열린다', () => {
    for (const one of touched) expect(canDeleteComplaint(one, true)).toBe(true);
  });

  it('아무도 안 본 건은 넣은 사람도 그대로 지운다', () => {
    const fresh = row({ status: 'branch', assign_type: 'auto' });
    expect(canDeleteComplaint(fresh)).toBe(true);
    expect(canDeleteComplaint(fresh, true)).toBe(true);
  });
});
