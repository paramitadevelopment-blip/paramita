import { describe, it, expect } from 'vitest';
import {
  countByDepartment,
  dailyAverage,
  mergeRangeRows,
  koreanDay,
  isDayString,
  daysBetween,
  koreanDayBounds,
} from '@/lib/rangeRows';

/**
 * 기간 조회가 여러 파일을 한 표로 바르게 합치는가.
 *
 * 여기가 틀리면 다른 파일의 값이 엉뚱한 열 밑에 서거나, 자정 근처에 배포한
 * 파일이 전날로 잡힌다. 둘 다 표를 보는 사람은 알아챌 수 없다.
 */
describe('mergeRangeRows', () => {
  const files = [
    {
      name: '20260908동양생명_경기.xlsx',
      uploadedAt: '2026-09-08T01:40:46Z',
      department: '경기',
      rows: [
        { 번호: 1, 고객명: '김경기', 주소: '수원', 배정방식: '규칙' },
        { 번호: 2, 고객명: '이경기', 주소: '용인', 배정방식: '사람' },
      ],
    },
    {
      name: '20260907흥국화재_한울부원.xlsx',
      uploadedAt: '2026-09-07T05:00:00Z',
      department: '한울부원',
      // 이 파일에만 있는 열(옵션1), 이 파일에 없는 열(주소)
      rows: [{ 번호: 1, 고객명: '박부산', 옵션1: 'A', 배정방식: '규칙' }],
    },
  ];

  it('배포일 순으로 이어 붙이고 번호를 다시 센다', () => {
    const { rows } = mergeRangeRows(files);
    expect(rows.map((r) => r[0])).toEqual([1, 2, 3]);
    expect(rows.map((r) => r[1])).toEqual(['2026-09-07', '2026-09-08', '2026-09-08']);
    expect(rows.map((r) => r[2])).toEqual(['한울부원', '경기', '경기']);
  });

  it('열은 처음 나온 순서로, 없는 값은 빈칸', () => {
    const { headers, rows } = mergeRangeRows(files);
    expect(headers).toEqual(['번호', '배포일', '소속', '고객명', '옵션1', '배정방식', '주소']);
    // 한울부원 줄에는 주소가 없다 → 빈칸. 경기 줄에는 옵션1이 없다 → 빈칸.
    expect(rows[0][headers.indexOf('주소')]).toBe('');
    expect(rows[1][headers.indexOf('옵션1')]).toBe('');
    expect(rows[1][headers.indexOf('주소')]).toBe('수원');
  });

  it('숨길 열은 빠진다 — 관리자에게만 보이는 배정방식', () => {
    const { headers, rows } = mergeRangeRows(files, ['배정방식']);
    expect(headers).not.toContain('배정방식');
    expect(rows[0]).toHaveLength(headers.length);
  });

  it('파일 안의 번호는 안 쓴다 — 합치면 겹친다', () => {
    const { headers } = mergeRangeRows(files);
    expect(headers.filter((h) => h === '번호')).toHaveLength(1);
  });

  it('파일이 없으면 머리글만', () => {
    expect(mergeRangeRows([])).toEqual({ headers: ['번호', '배포일', '소속'], rows: [] });
  });
});

describe('소속별 건수와 일평균', () => {
  const files = [
    { name: 'a', uploadedAt: '2026-09-01T00:00:00Z', department: '파라인슈', rows: [{}, {}, {}] },
    { name: 'b', uploadedAt: '2026-09-02T00:00:00Z', department: '굿모닝제너럴', rows: [{}, {}] },
    { name: 'c', uploadedAt: '2026-09-03T00:00:00Z', department: '파라인슈', rows: [{}, {}] },
    { name: 'd', uploadedAt: '2026-09-03T00:00:00Z', department: null, rows: [{}] },
  ];

  it('소속별로 합쳐 많은 순으로 낸다', () => {
    expect(countByDepartment(files, 3)).toEqual([
      { department: '파라인슈', count: 5, dailyAverage: 1.7 },
      { department: '굿모닝제너럴', count: 2, dailyAverage: 0.7 },
      { department: '소속 없음', count: 1, dailyAverage: 0.3 },
    ]);
  });

  it('소속별 합은 전체 행 수와 같다 — 어디서도 새지 않는다', () => {
    const sum = countByDepartment(files, 3).reduce((n, d) => n + d.count, 0);
    expect(sum).toBe(mergeRangeRows(files).rows.length);
  });

  it('일평균은 달력 날짜로 나누고 소수 첫째 자리까지', () => {
    expect(dailyAverage(28, 8)).toBe(3.5);
    expect(dailyAverage(10, 3)).toBe(3.3);
    expect(dailyAverage(0, 30)).toBe(0);
    expect(dailyAverage(5, 0)).toBe(0);
  });
});

describe('한국 날짜', () => {
  it('UTC 자정 직전은 한국에서는 다음 날이다', () => {
    // 2026-09-07 23:00Z = 2026-09-08 08:00 KST
    expect(koreanDay('2026-09-07T23:00:00Z')).toBe('2026-09-08');
    expect(koreanDay('2026-09-08T01:40:46Z')).toBe('2026-09-08');
  });

  it('못 읽는 시각은 빈 문자열', () => {
    expect(koreanDay('없음')).toBe('');
  });

  it('기간 경계도 한국 시간으로 잡는다', () => {
    expect(koreanDayBounds('2026-09-01', '2026-09-08')).toEqual({
      start: '2026-09-01T00:00:00+09:00',
      end: '2026-09-08T23:59:59.999+09:00',
    });
  });
});

describe('날짜 검사', () => {
  it('실제 있는 날만 받는다', () => {
    expect(isDayString('2026-09-08')).toBe(true);
    expect(isDayString('2026-02-30')).toBe(false);
    expect(isDayString('2026-13-01')).toBe(false);
    expect(isDayString('26-09-08')).toBe(false);
    expect(isDayString('')).toBe(false);
  });

  it('일수는 양 끝을 포함한다', () => {
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(1);
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(30);
    expect(daysBetween('2026-09-08', '2026-09-01')).toBeLessThanOrEqual(0);
  });
});
