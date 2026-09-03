import { describe, it, expect } from 'vitest';
import { isUntouchedComplaint } from '@/lib/complaints';
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
    agent_id: null as number | null,
    handled_at: null as string | null,
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

  it('지사가 설계사를 지정했으면 잠긴다', () => {
    expect(isUntouchedComplaint(row({ status: 'agent', agent_id: 7 }))).toBe(false);
  });

  it('처리가 끝났으면 잠긴다', () => {
    expect(
      isUntouchedComplaint(row({ status: 'done', handled_at: '2026-09-03T00:00:00Z' }))
    ).toBe(false);
  });

  it('반려됐으면 잠긴다 — 되돌린 것 자체가 기록이다', () => {
    expect(isUntouchedComplaint(row({ status: 'returned' }))).toBe(false);
  });

  /**
   * 상태만 보면 놓치는 자리. 설계사를 지정했다가 무를 일이 생겨도
   * 그 사람이 이미 내용을 본 뒤라 뒤에서 바꾸면 안 된다.
   */
  it('상태가 되돌아가도 설계사가 붙어 있으면 잠긴다', () => {
    expect(isUntouchedComplaint(row({ status: 'branch', agent_id: 7 }))).toBe(false);
  });

  it('처리 시각이 남아 있으면 상태와 무관하게 잠긴다', () => {
    expect(
      isUntouchedComplaint(row({ status: 'branch', handled_at: '2026-09-03T00:00:00Z' }))
    ).toBe(false);
  });
});
