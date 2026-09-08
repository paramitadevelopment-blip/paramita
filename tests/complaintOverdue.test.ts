import { describe, it, expect } from 'vitest';
import {
  daysSince,
  isOverdueComplaint,
  COMPLAINT_OVERDUE_DAYS,
  type ComplaintStatus,
} from '@/lib/complaints';

/**
 * 접수 후 경과일과 '밀린 건' 판정.
 *
 * 목록에서 색이 붙은 줄이 곧 "지금 손봐야 할 것"이 되어야 한다. 여기가
 * 흔들리면 다 처리한 건에 빨간 표시가 붙거나, 정작 밀린 건이 조용히 묻힌다.
 *
 * 날짜는 **보는 사람의 날짜**로 센다. 그래서 이 파일도 UTC가 아니라 현지
 * 시각으로 적는다 — UTC로 적으면 한국에서는 하루 어긋난 것을 시험하게 된다.
 */

/** 현지 시각. (연, 월, 일, 시) */
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);
const iso = (y: number, m: number, d: number, h = 12) => at(y, m, d, h).toISOString();

describe('경과일', () => {
  it('접수 당일은 몇 시든 0일이다', () => {
    expect(daysSince(iso(2026, 9, 4, 1), at(2026, 9, 4, 23))).toBe(0);
    expect(daysSince(iso(2026, 9, 4, 23), at(2026, 9, 4, 23))).toBe(0);
  });

  it('날짜가 하루 넘어가면 1일', () => {
    expect(daysSince(iso(2026, 9, 3, 23), at(2026, 9, 4, 1))).toBe(1);
  });

  /**
   * 시각이 아니라 날짜로 세야 한다. 시간 단위로 세면 아침에 본 사람과 저녁에
   * 본 사람이 다른 숫자를 보게 되고, '3일 넘은 건'의 기준이 흔들린다.
   */
  it('같은 날 안에서는 몇 시에 보든 같다', () => {
    const made = iso(2026, 9, 1, 15);
    expect(daysSince(made, at(2026, 9, 4, 0))).toBe(3);
    expect(daysSince(made, at(2026, 9, 4, 23))).toBe(3);
  });

  it('미래 날짜는 0으로 본다 — 음수가 화면에 나오면 안 된다', () => {
    expect(daysSince(iso(2026, 9, 10), at(2026, 9, 4))).toBe(0);
  });

  it('값이 없으면 0', () => {
    expect(daysSince(null)).toBe(0);
  });
});

describe('밀린 건', () => {
  const row = (status: ComplaintStatus, created: string) => ({ status, created_at: created });
  const now = at(2026, 9, 4);

  it(`아직 할 일이 남았고 ${COMPLAINT_OVERDUE_DAYS}일이 지났으면 밀린 건`, () => {
    expect(isOverdueComplaint(row('branch', iso(2026, 9, 1)), now)).toBe(true);
    expect(isOverdueComplaint(row('unassigned', iso(2026, 9, 1)), now)).toBe(true);
    expect(isOverdueComplaint(row('branch', iso(2026, 8, 20)), now)).toBe(true);
  });

  it('아직 기한 안이면 밀린 건이 아니다', () => {
    expect(isOverdueComplaint(row('branch', iso(2026, 9, 2)), now)).toBe(false);
  });

  /** 끝난 건에 빨간 표시가 붙으면, 색이 '할 일'을 뜻하지 않게 된다. */
  it('처리 완료·반려·철회는 아무리 오래돼도 밀린 건이 아니다', () => {
    expect(isOverdueComplaint(row('done', iso(2026, 1, 1)), now)).toBe(false);
    expect(isOverdueComplaint(row('returned', iso(2026, 1, 1)), now)).toBe(false);
    // 철회는 넣은 사람이 닫은 것이다. 한때 여기 빠져 있어 6일 된 철회 건이 밀린 건으로 잡혔다.
    expect(isOverdueComplaint(row('withdrawn', iso(2026, 1, 1)), now)).toBe(false);
  });

  it('경계: 정확히 3일째부터 밀린 건', () => {
    expect(isOverdueComplaint(row('branch', iso(2026, 9, 2)), now)).toBe(false); // 2일
    expect(isOverdueComplaint(row('branch', iso(2026, 9, 1)), now)).toBe(true); // 3일
  });
});
