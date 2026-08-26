import { describe, it, expect } from 'vitest';
import { historyWindowStart } from '@/lib/historyLookup';
import { HISTORY_DUP_DAYS } from '@/lib/insurance';

/**
 * 과거를 어디까지 거슬러 보는지의 경계.
 *
 * 여기가 틀리면 30일이 지난 건을 중복이라고 지우거나(멀쩡한 고객이 사라짐),
 * 29일 전 건을 놓쳐 같은 고객에게 두 번 연락이 간다.
 */

/** 그날 안에 있으면 걸린다 */
const includes = (now: Date, uploadedAt: Date) => uploadedAt >= historyWindowStart(now);

describe('30일 경계', () => {
  const now = new Date(2026, 7, 25, 10, 0, 0); // 8/25 오전 10시

  it('경계는 D-30 날짜의 0시다', () => {
    const start = historyWindowStart(now);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6); // 7월
    expect(start.getDate()).toBe(26);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
  });

  it('29일 전은 걸린다', () => {
    expect(includes(now, new Date(2026, 6, 27, 9, 0))).toBe(true);
  });

  it('딱 30일 전은 걸린다 — 그날 몇 시든', () => {
    expect(includes(now, new Date(2026, 6, 26, 0, 0))).toBe(true);
    expect(includes(now, new Date(2026, 6, 26, 9, 0))).toBe(true);
    expect(includes(now, new Date(2026, 6, 26, 23, 59))).toBe(true);
  });

  it('31일 전은 안 걸린다', () => {
    expect(includes(now, new Date(2026, 6, 25, 23, 59))).toBe(false);
    expect(includes(now, new Date(2026, 6, 25, 9, 0))).toBe(false);
  });

  /**
   * 이게 이 함수를 만든 이유다.
   * 시각으로 재면 같은 날 올린 건인데도 배포 시각에 따라 갈렸다.
   */
  it('오늘 몇 시에 배포하든 경계가 같다', () => {
    const 아침 = historyWindowStart(new Date(2026, 7, 25, 8, 0));
    const 저녁 = historyWindowStart(new Date(2026, 7, 25, 20, 0));
    expect(아침.getTime()).toBe(저녁.getTime());
  });

  it('같은 날 올린 건은 시각과 무관하게 같은 결과다', () => {
    const 그날아침 = new Date(2026, 6, 26, 9, 0);
    const 그날저녁 = new Date(2026, 6, 26, 18, 0);
    expect(includes(now, 그날아침)).toBe(includes(now, 그날저녁));
  });

  it('오늘 올린 건은 당연히 걸린다', () => {
    expect(includes(now, new Date(2026, 7, 25, 9, 0))).toBe(true);
  });
});

describe('달·해를 넘어갈 때', () => {
  it('월초에서 지난달로 넘어간다', () => {
    // 3/5 기준 30일 전 = 2/3
    const start = historyWindowStart(new Date(2026, 2, 5, 10, 0));
    expect(start.getMonth()).toBe(1);
    expect(start.getDate()).toBe(3);
  });

  it('연초에서 작년으로 넘어간다', () => {
    // 1/10 기준 30일 전 = 작년 12/11
    const start = historyWindowStart(new Date(2027, 0, 10, 10, 0));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(11);
    expect(start.getDate()).toBe(11);
  });

  it('윤년 2월도 건너뛴다', () => {
    // 2028년은 윤년. 3/20 기준 30일 전 = 2/19
    const start = historyWindowStart(new Date(2028, 2, 20, 10, 0));
    expect(start.getMonth()).toBe(1);
    expect(start.getDate()).toBe(19);
  });
});

describe('설정값과 어긋나지 않는다', () => {
  it('상수를 바꾸면 경계도 따라간다', () => {
    const now = new Date(2026, 7, 25, 10, 0);
    const start = historyWindowStart(now);
    const diffDays = Math.round((new Date(2026, 7, 25).getTime() - start.getTime()) / 86400000);
    expect(diffDays).toBe(HISTORY_DUP_DAYS);
  });
});
