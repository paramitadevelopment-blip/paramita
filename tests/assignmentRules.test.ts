import { describe, it, expect } from 'vitest';
import {
  AGE_BRACKETS,
  toAgeBracket,
  matchDepartments,
  type DepartmentRule,
} from '@/lib/assignmentRules';

/**
 * 배정 규칙 판정.
 *
 * 지역과 나이는 AND다. 한쪽만 맞는 건은 그 소속으로 가면 안 된다 —
 * 그게 "남는 DB"가 되어 예외로 빠지고 사람이 고르게 된다.
 */

const RULES: DepartmentRule[] = [
  { group: '경기', regions: ['서울', '인천'], ageBrackets: ['under70'] },
  { group: '굿모닝제너럴', regions: ['서울'], ageBrackets: ['70to75', 'over75'] },
  { group: '한울부원', regions: ['부산', '경남'], ageBrackets: ['under70', '70to75', 'over75'] },
];

describe('나이 구간', () => {
  it('경계는 70세와 75세다', () => {
    expect(toAgeBracket(69)).toBe('under70');
    expect(toAgeBracket(70)).toBe('70to75');
    expect(toAgeBracket(74)).toBe('70to75');
    expect(toAgeBracket(75)).toBe('over75');
    expect(toAgeBracket(76)).toBe('over75');
  });

  it('아주 어리거나 아주 많아도 구간이 있다', () => {
    expect(toAgeBracket(0)).toBe('under70');
    expect(toAgeBracket(120)).toBe('over75');
  });

  it('구간은 셋이고 중복이 없다', () => {
    expect(AGE_BRACKETS).toHaveLength(3);
    expect(new Set(AGE_BRACKETS).size).toBe(3);
  });
});

describe('지역과 나이를 함께 봐야 걸린다', () => {
  it('둘 다 맞으면 걸린다', () => {
    expect(matchDepartments(RULES, '서울', 'under70')).toEqual(['경기']);
  });

  /** 경기지사는 서울을 맡지만 70세 미만만 맡는다. 70~75세는 남는 건이다. */
  it('지역만 맞고 나이가 다르면 그 소속은 빠진다', () => {
    expect(matchDepartments(RULES, '서울', '70to75')).toEqual(['굿모닝제너럴']);
  });

  it('나이만 맞고 지역이 다르면 안 걸린다', () => {
    expect(matchDepartments(RULES, '대전', 'under70')).toEqual([]);
  });
});

describe('후보 수에 따라 처리가 갈린다', () => {
  it('1개면 자동배정 대상이다', () => {
    expect(matchDepartments(RULES, '인천', 'under70')).toEqual(['경기']);
  });

  /** 같은 조건을 둘 이상이 맡고 있으면 사람이 고른다. */
  it('여럿이 같은 조건을 맡으면 모두 후보로 나온다', () => {
    const overlapping: DepartmentRule[] = [
      ...RULES,
      { group: '한울부원', regions: ['서울'], ageBrackets: ['under70'] },
    ];
    expect(matchDepartments(overlapping, '서울', 'under70')).toEqual(['경기', '한울부원']);
  });

  /** 아무도 안 맡은 조합. 그냥 두면 사라지므로 사람이 고르게 해야 한다. */
  it('아무도 안 맡으면 빈 배열', () => {
    expect(matchDepartments(RULES, '세종', 'over75')).toEqual([]);
    expect(matchDepartments([], '서울', 'under70')).toEqual([]);
  });
});

/**
 * 자동배분이 "같으면 앞엣것"을 고르므로, 설정한 순서에 따라 결과가 흔들리면
 * 같은 파일을 두 번 돌렸을 때 배정이 달라진다.
 */
describe('결과 순서는 설정 순서와 무관하다', () => {
  it('규칙을 뒤집어 넣어도 같은 순서로 나온다', () => {
    const a: DepartmentRule[] = [
      { group: '한울부원', regions: ['서울'], ageBrackets: ['under70'] },
      { group: '경기', regions: ['서울'], ageBrackets: ['under70'] },
    ];
    const b = [...a].reverse();

    expect(matchDepartments(a, '서울', 'under70')).toEqual(
      matchDepartments(b, '서울', 'under70')
    );
  });
});
