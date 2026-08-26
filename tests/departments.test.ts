import { describe, it, expect } from 'vitest';
import {
  toDepartmentGroups,
  toAssignableDepartmentGroups,
  getSubDepartments,
  isAssignableGroup,
  getUndeletableReason,
} from '@/lib/departments';
import { parsePagination } from '@/lib/pagination';

/**
 * 소속 그룹화 검증.
 * 사용자는 조직('파라인슈')에 속하고 파일은 배정 분류('파라인슈1')에 속한다.
 * 이 매핑이 틀리면 사용자에게 파일이 하나도 안 보이거나, 남의 부서 파일이 보인다.
 */

// 운영 DB와 같은 구성
const DEPARTMENTS = [
  { id: 15, name: '관리자', group_name: '관리자' },
  { id: 23, name: '굿모닝제너럴', group_name: '굿모닝제너럴' },
  { id: 25, name: '이외지역', group_name: '이외지역' },
  { id: 29, name: '경기', group_name: '경기' },
  { id: 30, name: '한울부원', group_name: '한울부원' },
  { id: 31, name: '파라인슈1', group_name: '파라인슈' },
  { id: 32, name: '파라인슈2', group_name: '파라인슈' },
];

describe('소속을 조직 단위로 접기', () => {
  it('파라인슈1·2는 파라인슈 한 줄이 된다', () => {
    const groups = toDepartmentGroups(DEPARTMENTS);
    expect(groups).toContain('파라인슈');
    expect(groups).not.toContain('파라인슈1');
    expect(groups).not.toContain('파라인슈2');
  });

  it('1:1인 소속은 그대로 남는다', () => {
    const groups = toDepartmentGroups(DEPARTMENTS);
    expect(groups).toEqual(
      expect.arrayContaining(['굿모닝제너럴', '이외지역', '경기', '한울부원'])
    );
  });

  it('관리자는 소속이 아니라 계정 구분이라 뺀다', () => {
    expect(toDepartmentGroups(DEPARTMENTS)).not.toContain('관리자');
  });

  it('중복이 없다', () => {
    const groups = toDepartmentGroups(DEPARTMENTS);
    expect(new Set(groups).size).toBe(groups.length);
  });

  it('입력이 없거나 배열이 아니면 빈 배열을 준다', () => {
    expect(toDepartmentGroups(undefined)).toEqual([]);
    expect(toDepartmentGroups([])).toEqual([]);
  });
});

describe('하위 분류 (2단계 필터용)', () => {
  it('쪼개진 조직은 하위를 준다', () => {
    expect(getSubDepartments(DEPARTMENTS, '파라인슈')).toEqual(['파라인슈1', '파라인슈2']);
  });

  it('쪼개지지 않은 조직은 빈 배열이다 — 하위 줄을 그리지 않기 위함', () => {
    // 하위가 자기 자신 하나뿐이면 [전체][한울부원] 두 버튼이 같은 뜻이라 군더더기다
    expect(getSubDepartments(DEPARTMENTS, '한울부원')).toEqual([]);
    expect(getSubDepartments(DEPARTMENTS, '경기')).toEqual([]);
  });

  it('없는 조직이나 빈 값이면 빈 배열이다', () => {
    expect(getSubDepartments(DEPARTMENTS, '없는소속')).toEqual([]);
    expect(getSubDepartments(DEPARTMENTS, '')).toEqual([]);
    expect(getSubDepartments(undefined, '파라인슈')).toEqual([]);
  });
});

describe('사람에게 배정 가능한 소속', () => {
  it('이외지역은 배정 대상에서 뺀다', () => {
    // 주소를 못 읽는 건이 모이는 자리라 파일은 생기지만 담당 조직이 아니다
    expect(toAssignableDepartmentGroups(DEPARTMENTS)).not.toContain('이외지역');
    expect(isAssignableGroup('이외지역')).toBe(false);
  });

  it('나머지 조직은 배정할 수 있다', () => {
    const assignable = toAssignableDepartmentGroups(DEPARTMENTS);
    expect(assignable).toEqual(
      expect.arrayContaining(['파라인슈', '한울부원', '경기', '굿모닝제너럴'])
    );
    expect(isAssignableGroup('파라인슈')).toBe(true);
  });

  it('배정 목록은 필터 목록에서 이외지역만 빠진 것이다', () => {
    // 파일 필터에는 이외지역이 남아야 한다 — 관리자가 그 파일을 봐야 하므로
    const all = toDepartmentGroups(DEPARTMENTS);
    const assignable = toAssignableDepartmentGroups(DEPARTMENTS);
    expect(all.filter((g) => g !== '이외지역')).toEqual(assignable);
  });
});

/**
 * 쪼개진 조직의 하위 분류는 혼자 지울 수 없다.
 *
 * 사용자는 조직('파라인슈')에 속하고 파일은 분류('파라인슈1')에 속한다.
 * 하나만 지우면 사용자는 그대로인데 파일만 갈 곳을 잃는다. 그 상태를 화면이
 * "0명의 사용자를 옮깁니다"로 안내해, 실제로 2명이 있는데도 0명처럼 보였다.
 */
describe('지울 수 없는 소속', () => {
  it('파라인슈1·파라인슈2는 막힌다', () => {
    expect(getUndeletableReason(DEPARTMENTS, '파라인슈1')).toBeTruthy();
    expect(getUndeletableReason(DEPARTMENTS, '파라인슈2')).toBeTruthy();
  });

  it('왜 못 지우는지 알려준다 — 회색 버튼만 있으면 고장으로 읽힌다', () => {
    const reason = getUndeletableReason(DEPARTMENTS, '파라인슈1')!;
    expect(reason).toContain('파라인슈');
    expect(reason).toContain('2개');
  });

  it('쪼개지지 않은 소속은 그대로 지워진다', () => {
    for (const name of ['경기', '굿모닝제너럴', '한울부원', '이외지역']) {
      expect(getUndeletableReason(DEPARTMENTS, name)).toBeNull();
    }
  });

  it('셋으로 쪼개져도 막는다', () => {
    const three = [...DEPARTMENTS, { id: 33, name: '파라인슈3', group_name: '파라인슈' }];
    expect(getUndeletableReason(three, '파라인슈3')).toContain('3개');
  });

  it('형제가 사라져 혼자 남으면 지울 수 있다', () => {
    // 더 이상 쪼개진 게 아니므로, 사용자를 옮기는 기존 흐름이 정상 동작한다
    const alone = DEPARTMENTS.filter((d) => d.name !== '파라인슈2');
    expect(getUndeletableReason(alone, '파라인슈1')).toBeNull();
  });

  it('없는 소속이면 막지 않는다 — 다른 곳에서 404로 걸러진다', () => {
    expect(getUndeletableReason(DEPARTMENTS, '없는소속')).toBeNull();
  });

  it('목록이 비어도 터지지 않는다', () => {
    expect(getUndeletableReason(undefined, '파라인슈1')).toBeNull();
    expect(getUndeletableReason([], '파라인슈1')).toBeNull();
  });

  /**
   * 화면이 "쪼개져 있다"고 보여주는 조직과 삭제를 막는 조직이 갈리면,
   * 하위 분류를 그려놓고 삭제는 열어주는 모순이 생긴다.
   */
  it('하위 분류를 내놓는 조직의 분류는 전부 막힌다', () => {
    for (const name of getSubDepartments(DEPARTMENTS, '파라인슈')) {
      expect(getUndeletableReason(DEPARTMENTS, name)).toBeTruthy();
    }
  });
});

describe('페이지네이션 파싱', () => {
  it('정상 입력은 그대로 쓴다', () => {
    expect(parsePagination('2', '20')).toEqual({ page: 2, limit: 20, offset: 20 });
  });

  it('값이 없으면 기본값을 쓴다', () => {
    expect(parsePagination(null, null)).toEqual({ page: 1, limit: 10, offset: 0 });
  });

  it('숫자가 아니면 기본값으로 떨어진다', () => {
    // NaN이 그대로 나가면 range(NaN, NaN)이 되어 조회가 깨진다
    expect(parsePagination('abc', 'xyz')).toEqual({ page: 1, limit: 10, offset: 0 });
  });

  it('0이나 음수 페이지는 1로 올린다', () => {
    expect(parsePagination('0', '10').page).toBe(1);
    expect(parsePagination('-5', '10').page).toBe(1);
    expect(parsePagination('-5', '10').offset).toBe(0);
  });

  it('limit은 상한에서 잘린다 — 한 번에 다 퍼가지 못하게', () => {
    expect(parsePagination('1', '999999').limit).toBe(100);
    expect(parsePagination('1', '0').limit).toBe(10);
    expect(parsePagination('1', '-3').limit).toBe(10);
  });

  it('offset은 page와 limit에서 일관되게 나온다', () => {
    expect(parsePagination('3', '25').offset).toBe(50);
  });
});
