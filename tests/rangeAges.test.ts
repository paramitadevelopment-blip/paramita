import { describe, it, expect } from 'vitest';
import { AGE_LABEL, countAgeSplit } from '@/lib/rangeAges';
import type { RangeSourceFile } from '@/lib/rangeRows';

const file = (insurer: 'hk' | 'dy' | null, uploadedAt: string, births: string[]): RangeSourceFile => ({
  name: 'x.xlsx',
  uploadedAt,
  department: '파라인슈',
  insurer,
  rows: births.map((b) => ({ 고객명: '가', 생년월일성별: b })),
});

// 2026-09-10 한국 낮 배포
const SEP10 = '2026-09-10T05:00:00Z';

describe('나이 구간 (70세 이하 / 71세 이상)', () => {
  it('구간 이름', () => {
    expect(AGE_LABEL).toEqual({ under: '70세 이하', over: '71세 이상' });
  });

  it('보험나이 70세는 이하 쪽, 71세부터 이상 쪽', () => {
    // 1957-01-01생: 만 69, 1/1 + 6개월 = 7/1 ≤ 9/10 → 보험나이 70 → 이하
    // 1956-01-01생: 만 70, 7/1 ≤ 9/10 → 보험나이 71 → 이상
    const got = countAgeSplit([file('dy', SEP10, ['5701011', '5601011'])]);
    expect(got.dy).toEqual({ under: 1, over: 1, unknown: 0 });
  });

  it('보험나이로 가른다 — 만 70세라도 생일 뒤 6개월이 지났으면 71세 이상', () => {
    // 1956-01-01생: 만 70이지만 보험나이 71
    // 1956-06-01생: 만 70, 6/1 + 6개월 = 12/1 > 9/10 → 보험나이 70
    const got = countAgeSplit([file('hk', SEP10, ['5601011', '5606012'])]);
    expect(got.hk).toEqual({ under: 1, over: 1, unknown: 0 });
  });

  it('기준은 배포한 날이다 — 같은 사람도 배포일에 따라 구간이 갈린다', () => {
    // 1956-03-15생: 3/15 + 6개월 = 9/15. 9/10 배포면 70, 9/20 배포면 71
    expect(countAgeSplit([file('hk', SEP10, ['5603151'])]).hk).toEqual({ under: 1, over: 0, unknown: 0 });
    expect(countAgeSplit([file('hk', '2026-09-20T05:00:00Z', ['5603151'])]).hk).toEqual({ under: 0, over: 1, unknown: 0 });
  });

  it('배포일은 한국 날짜로 자른다 — UTC 전날 밤이 한국 다음 날이면 다음 날 기준', () => {
    // 2026-09-14T15:30Z = 한국 9/15 00:30. 9/15 기준이면 보험나이 71
    expect(countAgeSplit([file('hk', '2026-09-14T15:30:00Z', ['5603151'])]).hk.over).toBe(1);
  });

  it('보험사마다 따로 센다. 보험사를 못 읽은 파일은 etc', () => {
    const got = countAgeSplit([
      file('dy', SEP10, ['8001011', '5001011']),
      file('hk', SEP10, ['8001011']),
      file(null, SEP10, ['5001011']),
    ]);
    expect(got).toEqual({
      dy: { under: 1, over: 1, unknown: 0 },
      hk: { under: 1, over: 0, unknown: 0 },
      etc: { under: 0, over: 1, unknown: 0 },
    });
  });

  it('생년월일을 못 읽으면 나이 미상 — 빼면 합이 보험사 건수와 안 맞는다', () => {
    const got = countAgeSplit([file('dy', SEP10, ['', '가나다', '8001011'])]);
    expect(got.dy).toEqual({ under: 1, over: 0, unknown: 2 });
    expect(got.dy.under + got.dy.over + got.dy.unknown).toBe(3);
  });

  it('생년월일 열이 없는 파일은 전부 나이 미상', () => {
    const f: RangeSourceFile = { ...file('hk', SEP10, []), rows: [{ 고객명: '가' }, { 고객명: '나' }] };
    expect(countAgeSplit([f]).hk).toEqual({ under: 0, over: 0, unknown: 2 });
  });
});
