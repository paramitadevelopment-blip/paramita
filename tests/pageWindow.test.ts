import { describe, it, expect } from 'vitest';
import { pageWindow, type PageItem } from '@/lib/pageWindow';

/** 그려질 번호만. 접힌 자리는 뺀다. */
const nums = (items: PageItem[]) => items.filter((x): x is number => x !== 'gap');

describe('페이지 번호 줄', () => {
  it('쪽수가 적으면 다 그린다', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('많아지면 지금 쪽 둘레만 남기고 접는다', () => {
    expect(pageWindow(50, 100)).toEqual([1, 'gap', 48, 49, 50, 51, 52, 'gap', 100]);
  });

  it('첫 쪽 근처에서는 앞을 안 접는다', () => {
    expect(pageWindow(1, 100)).toEqual([1, 2, 3, 4, 5, 6, 7, 'gap', 100]);
    expect(pageWindow(5, 100)).toEqual([1, 2, 3, 4, 5, 6, 7, 'gap', 100]);
  });

  it('끝 쪽 근처에서는 뒤를 안 접는다', () => {
    expect(pageWindow(100, 100)).toEqual([1, 'gap', 94, 95, 96, 97, 98, 99, 100]);
    expect(pageWindow(96, 100)).toEqual([1, 'gap', 94, 95, 96, 97, 98, 99, 100]);
  });

  it('첫 쪽·끝 쪽은 언제나 보인다', () => {
    for (const p of [1, 2, 7, 33, 60, 99, 100]) {
      const got = nums(pageWindow(p, 100));
      expect(got[0]).toBe(1);
      expect(got[got.length - 1]).toBe(100);
    }
  });

  it('지금 쪽은 언제나 들어 있다', () => {
    for (let p = 1; p <= 100; p++) {
      expect(nums(pageWindow(p, 100))).toContain(p);
    }
  });

  it('그리는 개수가 어디서나 같아 줄이 흔들리지 않는다', () => {
    const widths = new Set<number>();
    for (let p = 1; p <= 100; p++) widths.add(pageWindow(p, 100).length);
    expect([...widths]).toEqual([9]);
  });

  it('번호는 오름차순이고 겹치지 않는다', () => {
    for (let p = 1; p <= 100; p++) {
      const got = nums(pageWindow(p, 100));
      expect(got).toEqual([...new Set(got)]);
      expect(got).toEqual([...got].sort((a, b) => a - b));
    }
  });

  it("'…' 자리에는 실제로 건너뛴 쪽이 있다", () => {
    // '1 … 3' 처럼 하나만 감추면 접은 보람이 없다. 그런 자리는 번호로 편다.
    for (let p = 1; p <= 100; p++) {
      const items = pageWindow(p, 100);
      items.forEach((item, at) => {
        if (item !== 'gap') return;
        const before = items[at - 1] as number;
        const after = items[at + 1] as number;
        expect(after - before).toBeGreaterThan(2);
      });
    }
  });

  it('span 을 넓히면 더 많이 보인다', () => {
    expect(pageWindow(50, 100, 1)).toEqual([1, 'gap', 49, 50, 51, 'gap', 100]);
    expect(pageWindow(50, 100, 3)).toEqual([1, 'gap', 47, 48, 49, 50, 51, 52, 53, 'gap', 100]);
  });

  it('말이 안 되는 값에도 안 무너진다', () => {
    expect(pageWindow(1, 0)).toEqual([]);
    expect(pageWindow(1, -5)).toEqual([]);
    expect(pageWindow(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 'gap', 10]);
    // 범위를 벗어난 지금 쪽은 양 끝으로 당겨 붙인다
    expect(pageWindow(999, 100)).toEqual(pageWindow(100, 100));
    expect(pageWindow(-3, 100)).toEqual(pageWindow(1, 100));
  });
});
