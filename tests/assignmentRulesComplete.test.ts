import { describe, it, expect } from 'vitest';
import { findIncompleteRules, describeIncomplete } from '@/lib/assignmentRules';
import type { DepartmentRule } from '@/lib/assignmentRules';

/**
 * 설정이 덜 된 소속 판정.
 *
 * 지역과 나이는 AND로 걸린다. 한쪽이 비면 그 소속은 아무 건도 못 받는데
 * 화면상으로는 설정된 것처럼 보인다. 그 상태로 저장되면 그 지역 건이 전부
 * 수동배정으로 떨어지고, 왜 그런지 알아채기까지 오래 걸린다.
 */

const rule = (group: string, regions: string[], ageBrackets: string[]): DepartmentRule =>
  ({ group, regions, ageBrackets }) as DepartmentRule;

describe('설정이 덜 된 소속 (findIncompleteRules)', () => {
  it('둘 다 골랐으면 통과한다', () => {
    expect(findIncompleteRules([rule('경기', ['서울'], ['under70'])])).toEqual([]);
  });

  it('지역만 고르고 나이를 안 고르면 잡는다', () => {
    const [found] = findIncompleteRules([rule('경기', ['서울'], [])]);
    expect(found.group).toBe('경기');
    expect(found.noAgeBracket).toBe(true);
    expect(found.noRegion).toBe(false);
  });

  it('나이만 고르고 지역을 안 고르면 잡는다', () => {
    const [found] = findIncompleteRules([rule('경기', [], ['under70'])]);
    expect(found.noRegion).toBe(true);
    expect(found.noAgeBracket).toBe(false);
  });

  it('아무것도 안 고른 소속도 잡는다', () => {
    const [found] = findIncompleteRules([rule('새지사', [], [])]);
    expect(found.noRegion).toBe(true);
    expect(found.noAgeBracket).toBe(true);
  });

  it('덜 된 소속만 골라낸다', () => {
    const found = findIncompleteRules([
      rule('경기', ['서울'], ['under70']),
      rule('한울부원', ['부산'], []),
      rule('파라인슈', [], ['over75']),
    ]);

    expect(found.map((f) => f.group)).toEqual(['한울부원', '파라인슈']);
  });

  it('값이 없어도 터지지 않는다', () => {
    expect(findIncompleteRules(undefined)).toEqual([]);
    expect(findIncompleteRules([])).toEqual([]);
  });
});

describe('빠진 것 문구 (describeIncomplete)', () => {
  it('무엇이 빠졌는지 갈라서 말한다', () => {
    expect(describeIncomplete({ group: 'A', noRegion: true, noAgeBracket: false }))
      .toBe('지역 선택 안 됨');
    expect(describeIncomplete({ group: 'A', noRegion: false, noAgeBracket: true }))
      .toBe('나이 선택 안 됨');
    expect(describeIncomplete({ group: 'A', noRegion: true, noAgeBracket: true }))
      .toBe('지역·나이 모두 선택 안 됨');
  });
});
