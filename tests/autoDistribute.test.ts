import { describe, it, expect } from 'vitest';
import {
  autoDistributePending,
  birthSortKey,
  parseJuminBirth,
  REGION_CHOICES,
  type PendingEntry,
} from '@/lib/insurance';

/**
 * 자동 배분 검증.
 *
 * 사람이 골라야 하는 건들을 소속별 숫자가 고르게 되도록 나눈다.
 * 규칙을 어기면(강원 건이 경기로 가면) 배포 서버가 거부하므로,
 * "고르게 나누는가"와 "갈 수 있는 곳에만 넣는가"를 둘 다 봐야 한다.
 */

/** 갈 곳별 배분 결과 수를 센다. */
function countBy(picks: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const dept of Object.values(picks)) counts[dept] = (counts[dept] || 0) + 1;
  return counts;
}

/** 주민번호를 만든다. 뒤 숫자가 클수록 늦게 태어난 사람이다. */
const jumin = (yymmdd: string, gender = '1') => `${yymmdd}${gender}`;

describe('생년월일 읽기', () => {
  it('성별코드로 세기를 가른다', () => {
    // 1·2·5·6 → 1900년대, 3·4·7·8 → 2000년대, 9·0 → 1800년대
    expect(parseJuminBirth('9001011')?.getFullYear()).toBe(1990);
    expect(parseJuminBirth('0501013')?.getFullYear()).toBe(2005);
    expect(parseJuminBirth('9001019')?.getFullYear()).toBe(1890);
  });

  it('읽을 수 없으면 null이다', () => {
    expect(parseJuminBirth('')).toBeNull();
    expect(parseJuminBirth('abc')).toBeNull();
    expect(parseJuminBirth('9902301')).toBeNull(); // 2월 30일
  });

  it('정렬값은 이른 생일이 작다', () => {
    expect(birthSortKey('5001011')).toBeLessThan(birthSortKey('9001011'));
    expect(birthSortKey('9001011')).toBeLessThan(birthSortKey('9012311'));
  });

  it('못 읽는 값은 맨 뒤로 밀린다', () => {
    // 자동 배분에서 먼저 자리를 차지하지 않게 하려는 것이다
    expect(birthSortKey('')).toBeGreaterThan(birthSortKey('9912311'));
  });
});

describe('갈 수 있는 곳에만 넣는가', () => {
  it('강원 건은 굿모닝제너럴·파라인슈1 둘 중 하나다', () => {
    const pending: PendingEntry[] = Array.from({ length: 6 }, (_, i) => ({
      key: `k${i}`,
      region: '강원' as const,
      jumin: jumin(`70010${i + 1}`),
    }));

    const picks = autoDistributePending(pending);

    for (const dept of Object.values(picks)) {
      expect(REGION_CHOICES['강원']).toContain(dept);
    }
    // 경기로는 절대 가지 않는다 — 가면 배포가 거부한다
    expect(Object.values(picks)).not.toContain('경기');
  });

  it('서울·경기·인천 건은 세 곳 중 하나다', () => {
    const pending: PendingEntry[] = [
      { key: 'a', region: '서울', jumin: jumin('700101') },
      { key: 'b', region: '경기', jumin: jumin('700102') },
      { key: 'c', region: '인천', jumin: jumin('700103') },
    ];

    const picks = autoDistributePending(pending);

    expect(REGION_CHOICES['서울']).toContain(picks['a']);
    expect(REGION_CHOICES['경기']).toContain(picks['b']);
    expect(REGION_CHOICES['인천']).toContain(picks['c']);
  });
});

describe('고르게 나누는가', () => {
  it('빈 상태에서 9건이면 세 곳에 3건씩', () => {
    const pending: PendingEntry[] = Array.from({ length: 9 }, (_, i) => ({
      key: `k${i}`,
      region: '서울' as const,
      jumin: jumin(`7001${String(i + 1).padStart(2, '0')}`),
    }));

    expect(countBy(autoDistributePending(pending))).toEqual({
      경기: 3, 굿모닝제너럴: 3, 파라인슈1: 3,
    });
  });

  it('규칙으로 이미 배정된 수를 이어받아 채운다', () => {
    // 경기 2, 굿모닝 0, 파라인슈1 3 인 상태에서 5건을 더 넣으면
    // 최종이 (2+0+3+5)/3 = 3.33 → 4·3·3 이 되어야 한다.
    const pending: PendingEntry[] = Array.from({ length: 5 }, (_, i) => ({
      key: `k${i}`,
      region: '서울' as const,
      jumin: jumin(`7001${String(i + 1).padStart(2, '0')}`),
    }));

    const picks = autoDistributePending(pending, { 경기: 2, 굿모닝제너럴: 0, 파라인슈1: 3 });
    const added = countBy(picks);

    const final = {
      경기: 2 + (added['경기'] || 0),
      굿모닝제너럴: 0 + (added['굿모닝제너럴'] || 0),
      파라인슈1: 3 + (added['파라인슈1'] || 0),
    };

    // 가장 많은 곳과 가장 적은 곳의 차이가 1을 넘지 않아야 고르다
    const values = Object.values(final);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    expect(values.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('적게 받은 곳부터 메운다', () => {
    // 굿모닝만 0이고 나머지가 5씩이면, 3건은 전부 굿모닝으로 가야 한다
    const pending: PendingEntry[] = Array.from({ length: 3 }, (_, i) => ({
      key: `k${i}`,
      region: '서울' as const,
      jumin: jumin(`7001${String(i + 1).padStart(2, '0')}`),
    }));

    const picks = autoDistributePending(pending, { 경기: 5, 굿모닝제너럴: 0, 파라인슈1: 5 });
    expect(countBy(picks)).toEqual({ 굿모닝제너럴: 3 });
  });
});

describe('강원을 먼저 넣는가', () => {
  it('강원이 나중이면 몰릴 상황에서도 고르게 나뉜다', () => {
    // 강원 2건 + 서울 4건. 강원은 굿모닝·파라1만 가능하다.
    // 서울을 먼저 채우면 굿모닝·파라1이 차서 강원이 한쪽으로 몰린다.
    const pending: PendingEntry[] = [
      // 서울 건들이 생년월일상 더 이르다 (먼저 처리될 후보)
      { key: 's1', region: '서울', jumin: jumin('500101') },
      { key: 's2', region: '서울', jumin: jumin('500102') },
      { key: 's3', region: '서울', jumin: jumin('500103') },
      { key: 's4', region: '서울', jumin: jumin('500104') },
      { key: 'g1', region: '강원', jumin: jumin('900101') },
      { key: 'g2', region: '강원', jumin: jumin('900102') },
    ];

    const picks = autoDistributePending(pending);
    const counts = countBy(picks);

    // 6건이 세 곳에 2건씩
    expect(counts).toEqual({ 경기: 2, 굿모닝제너럴: 2, 파라인슈1: 2 });
    // 강원 둘은 서로 다른 곳으로 갈라진다
    expect(picks['g1']).not.toBe(picks['g2']);
  });
});

describe('생년월일 순서', () => {
  it('이른 생일부터 자리를 잡는다', () => {
    const pending: PendingEntry[] = [
      { key: 'young', region: '서울', jumin: jumin('900101') },
      { key: 'old', region: '서울', jumin: jumin('500101') },
    ];

    // 굿모닝만 비어 있으니 먼저 처리된 쪽이 굿모닝을 가져간다
    const picks = autoDistributePending(pending, { 경기: 5, 굿모닝제너럴: 0, 파라인슈1: 5 });
    expect(picks['old']).toBe('굿모닝제너럴');
  });

  it('같은 입력이면 항상 같은 결과다', () => {
    const pending: PendingEntry[] = [
      { key: 'a', region: '서울', jumin: jumin('700101') },
      { key: 'b', region: '인천', jumin: jumin('700101') }, // 생일 동일
      { key: 'c', region: '강원', jumin: jumin('700101') },
    ];

    const first = autoDistributePending(pending);
    const second = autoDistributePending([...pending].reverse());
    expect(first).toEqual(second);
  });
});

describe('가장자리', () => {
  it('대기 건이 없으면 빈 결과다', () => {
    expect(autoDistributePending([])).toEqual({});
  });

  it('생년월일을 못 읽어도 배정은 된다', () => {
    // 순서만 뒤로 밀릴 뿐, 빠뜨리면 배포가 막힌다
    const picks = autoDistributePending([{ key: 'x', region: '서울', jumin: '' }]);
    expect(REGION_CHOICES['서울']).toContain(picks['x']);
  });
});
