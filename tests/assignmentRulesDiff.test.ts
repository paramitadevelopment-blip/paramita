import { describe, it, expect } from 'vitest';
import {
  diffAssignmentRules,
  groupLogsByDay,
  toLocalDayKey,
  toSearchRange,
} from '@/lib/assignmentRulesDiff';
import type { DepartmentRule } from '@/lib/assignmentRules';

/**
 * 배정 규칙 저장 이력의 "무엇이 바뀌었나".
 *
 * 배정이 갑자기 달라졌을 때 되짚는 유일한 근거다. 여기가 틀리면
 * 엉뚱한 사람이 바꾼 것으로 읽히거나, 실제로 바뀐 것이 안 보인다.
 */

const rule = (group: string, regions: string[], ageBrackets: string[]): DepartmentRule =>
  ({ group, regions, ageBrackets }) as DepartmentRule;

describe('규칙 변경 비교 (diffAssignmentRules)', () => {
  it('지역이 늘면 잡아낸다', () => {
    const before = [rule('경기', ['서울'], ['under70'])];
    const after = [rule('경기', ['서울', '인천'], ['under70'])];

    const [change] = diffAssignmentRules(before, after);
    expect(change.group).toBe('경기');
    expect(change.addedRegions).toEqual(['인천']);
    expect(change.removedRegions).toEqual([]);
  });

  it('지역이 빠지면 잡아낸다', () => {
    const before = [rule('경기', ['서울', '인천'], ['under70'])];
    const after = [rule('경기', ['서울'], ['under70'])];

    expect(diffAssignmentRules(before, after)[0].removedRegions).toEqual(['인천']);
  });

  it('나이 구간은 사람이 읽는 이름으로 준다', () => {
    const before = [rule('경기', ['서울'], ['under70'])];
    const after = [rule('경기', ['서울'], ['under70', 'over75'])];

    expect(diffAssignmentRules(before, after)[0].addedBrackets).toEqual(['75세 이상']);
  });

  /* 저장 순서에 기대면 같은 기록을 볼 때마다 순서가 뒤바뀐다. */
  it('나이 구간은 늘 어린 순으로 나온다', () => {
    const before = [rule('경기', ['서울'], [])];
    const after = [rule('경기', ['서울'], ['over75', 'under70', '70to75'])];

    expect(diffAssignmentRules(before, after)[0].addedBrackets).toEqual([
      '70세 미만',
      '70~75세',
      '75세 이상',
    ]);
  });

  it('안 바뀐 소속은 목록에 안 넣는다', () => {
    const same = [rule('경기', ['서울'], ['under70']), rule('한울부원', ['부산'], ['over75'])];
    const after = [rule('경기', ['서울', '인천'], ['under70']), rule('한울부원', ['부산'], ['over75'])];

    const changes = diffAssignmentRules(same, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].group).toBe('경기');
  });

  it('아무것도 안 바뀌면 빈 배열이다', () => {
    const rules = [rule('경기', ['서울'], ['under70'])];
    expect(diffAssignmentRules(rules, rules)).toEqual([]);
  });

  /*
   * 앞 기록에 없던 소속은 그 설정 전체가 '추가'로 잡힌다.
   *
   * 이걸 "소속이 그때 생겼다"로 읽으면 안 된다 — 저장 요청에 그 소속이
   * 빠져 있어도 똑같은 모양이 된다. 소속 생성·삭제는 department_change_logs가 남긴다.
   */
  it('앞 기록에 없던 소속은 설정 전체가 추가로 잡힌다', () => {
    const before = [rule('경기', ['서울'], ['under70'])];
    const after = [rule('경기', ['서울'], ['under70']), rule('새지사', ['제주'], ['over75'])];

    const [change] = diffAssignmentRules(before, after);
    expect(change.group).toBe('새지사');
    expect(change.addedRegions).toEqual(['제주']);
    expect(change.addedBrackets).toEqual(['75세 이상']);
  });

  /*
   * 소속이 지워지면 그 규칙도 통째로 사라진다.
   * 목록에서 빠지기만 하면 "왜 그 지역이 갑자기 수동배정이 됐나"를 알 수 없다.
   */
  it('사라진 소속의 설정도 제거로 잡는다', () => {
    const before = [rule('경기', ['서울'], ['under70']), rule('없어질지사', ['제주'], ['over75'])];
    const after = [rule('경기', ['서울'], ['under70'])];

    const [change] = diffAssignmentRules(before, after);
    expect(change.group).toBe('없어질지사');
    expect(change.removedRegions).toEqual(['제주']);
    expect(change.removedBrackets).toEqual(['75세 이상']);
  });

  it('설정이 비어 있던 소속이 사라진 것은 변화로 안 친다', () => {
    const before = [rule('경기', ['서울'], ['under70']), rule('빈지사', [], [])];
    const after = [rule('경기', ['서울'], ['under70'])];

    expect(diffAssignmentRules(before, after)).toEqual([]);
  });

  it('앞 기록이 없으면 이번 설정 전체가 추가다', () => {
    const after = [rule('경기', ['서울'], ['under70'])];
    const [change] = diffAssignmentRules([], after);

    expect(change.addedRegions).toEqual(['서울']);
  });

  it('값이 없어도 터지지 않는다', () => {
    expect(diffAssignmentRules(undefined, undefined)).toEqual([]);
    expect(diffAssignmentRules(undefined, [])).toEqual([]);
  });
});

describe('전후 상태 (before / after)', () => {
  it('그 시점의 지역·나이를 함께 들고 있는다', () => {
    const before = [rule('경기', ['서울'], ['under70'])];
    const after = [rule('경기', ['서울', '인천'], ['under70', '70to75'])];

    const [change] = diffAssignmentRules(before, after);
    expect(change.before).toEqual({ regions: ['서울'], brackets: ['70세 미만'] });
    expect(change.after).toEqual({
      regions: ['서울', '인천'],
      brackets: ['70세 미만', '70~75세'],
    });
  });

  /* 저장 순서에 기대면 같은 기록을 볼 때마다 순서가 뒤바뀐다. */
  it('지역은 이름순, 나이는 어린 순으로 고정한다', () => {
    const before = [rule('경기', [], [])];
    const after = [rule('경기', ['인천', '강원', '서울'], ['over75', 'under70'])];

    const [change] = diffAssignmentRules(before, after);
    expect(change.after.regions).toEqual(['강원', '서울', '인천']);
    expect(change.after.brackets).toEqual(['70세 미만', '75세 이상']);
  });

  it('앞 기록에 없던 소속은 이전 상태가 비어 있다', () => {
    const before = [rule('경기', ['서울'], ['under70'])];
    const after = [rule('경기', ['서울'], ['under70']), rule('새지사', ['제주'], ['over75'])];

    const [change] = diffAssignmentRules(before, after);
    expect(change.before).toEqual({ regions: [], brackets: [] });
    expect(change.after.regions).toEqual(['제주']);
  });

  it('사라진 소속은 적용 후 상태가 비어 있다', () => {
    const before = [rule('경기', ['서울'], ['under70']), rule('없어질지사', ['제주'], ['over75'])];
    const after = [rule('경기', ['서울'], ['under70'])];

    const [change] = diffAssignmentRules(before, after);
    expect(change.before.regions).toEqual(['제주']);
    expect(change.after).toEqual({ regions: [], brackets: [] });
  });
});

describe('조회 기간 계산 (toSearchRange)', () => {
  it('시작일 00:00부터 종료일 23:59까지 잡는다', () => {
    const range = toSearchRange('2026-09-01', '2026-09-03')!;

    expect(new Date(range.from).getHours()).toBe(0);
    expect(new Date(range.to).getHours()).toBe(23);
    expect(new Date(range.to).getMinutes()).toBe(59);
  });

  /*
   * 'YYYY-MM-DD'를 그대로 넘기면 UTC로 잘려 밤 기록이 하루 밀린다.
   * 보는 사람 시간대의 그 날짜여야 한다.
   */
  it('보는 사람 시간대 기준으로 하루를 잡는다', () => {
    const range = toSearchRange('2026-09-03', '2026-09-03')!;
    const from = new Date(range.from);

    expect(from.getFullYear()).toBe(2026);
    expect(from.getMonth()).toBe(8);
    expect(from.getDate()).toBe(3);
  });

  it('시작만 고르면 오늘까지 본다', () => {
    const now = new Date(2026, 8, 10, 15, 0, 0);
    const range = toSearchRange('2026-09-01', '', now)!;

    expect(new Date(range.to).getDate()).toBe(10);
  });

  it('종료만 고르면 처음부터 그날까지 본다', () => {
    const range = toSearchRange('', '2026-09-03')!;
    expect(new Date(range.from).getTime()).toBe(0);
  });

  it('아무것도 안 고르면 기간 조회를 안 한다', () => {
    expect(toSearchRange('', '')).toBeNull();
  });

  /* 뒤집힌 기간으로 조회하면 늘 0건이 나와 "기록이 없다"로 잘못 읽힌다. */
  it('시작이 종료보다 늦으면 조회하지 않는다', () => {
    expect(toSearchRange('2026-09-05', '2026-09-01')).toBeNull();
  });

  it('같은 날을 고르면 그 하루만 본다', () => {
    const range = toSearchRange('2026-09-03', '2026-09-03')!;
    expect(new Date(range.from).getDate()).toBe(new Date(range.to).getDate());
  });
});
