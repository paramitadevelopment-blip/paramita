import { AGE_BRACKET_LABEL, type AgeBracket, type DepartmentRule } from '@/lib/assignmentRules';

/**
 * 두 시점의 배정 규칙을 견줘 무엇이 바뀌었는지 추린다.
 *
 * 기록에는 그때의 규칙 전체가 담긴다. 목록에 전체를 늘어놓으면 뭐가 달라졌는지
 * 사람이 눈으로 찾아야 하므로, 바로 앞 기록과 견준 결과만 보여준다.
 *
 * 여기서 말하는 건 규칙이 어떻게 달라졌는가뿐이다. 소속이 그때 생겼는지
 * 지워졌는지는 이 기록으로 알 수 없다 — 저장 요청에 그 소속이 빠져 있어도
 * 똑같이 "없다가 생긴" 모양이 된다. 소속 생성·삭제는 department_change_logs가 남긴다.
 *
 * 화면에 매인 코드가 아니라 순수 계산이라 lib에 둔다.
 */

/** 한 시점의 설정 상태 */
export interface RuleState {
  regions: string[];
  /** 화면에 보일 이름으로. 어린 순으로 고정한다 */
  brackets: string[];
}

/** 한 소속에서 달라진 것 */
export interface RuleChange {
  group: string;
  /*
   * 무엇이 늘고 줄었는지만 보면 "그래서 지금 어떻게 돼 있나"를 알 수 없다.
   * 되짚는 사람이 정작 알고 싶은 건 그 시점의 상태라, 전후를 함께 들고 다닌다.
   */
  before: RuleState;
  after: RuleState;
  /** 새로 맡게 된 지역 */
  addedRegions: string[];
  /** 더 이상 안 맡는 지역 */
  removedRegions: string[];
  /** 새로 맡게 된 나이대 (화면에 보일 이름) */
  addedBrackets: string[];
  removedBrackets: string[];
}

/** 지역은 설정 순서에 기대지 않게 이름순으로 고정한다 */
function toState(rule: { regions?: string[]; ageBrackets?: string[] } | undefined): RuleState {
  return {
    regions: [...(rule?.regions ?? [])].sort((x, y) => x.localeCompare(y, 'ko-KR')),
    brackets: sortBrackets([...(rule?.ageBrackets ?? [])]).map(bracketLabel),
  };
}

const AGE_ORDER: readonly string[] = ['under70', '70to75', 'over75'];

/** 나이 구간을 사람이 읽는 이름으로. 모르는 값은 그대로 둔다 */
function bracketLabel(bracket: string): string {
  return AGE_BRACKET_LABEL[bracket as AgeBracket] ?? bracket;
}

/** a에는 있고 b에는 없는 것 */
function missing(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] {
  const has = new Set(b ?? []);
  return (a ?? []).filter((v) => !has.has(v));
}

/** 나이 구간은 어린 순으로 고정한다. 저장 순서에 기대면 볼 때마다 뒤바뀐다 */
function sortBrackets(list: string[]): string[] {
  return [...list].sort((x, y) => AGE_ORDER.indexOf(x) - AGE_ORDER.indexOf(y));
}

/**
 * @param before 바로 앞 기록의 규칙. 첫 기록이면 빈 배열
 * @param after  이 기록의 규칙
 * @returns 달라진 소속만. 아무것도 안 바뀌었으면 빈 배열
 */
export function diffAssignmentRules(
  before: DepartmentRule[] | undefined,
  after: DepartmentRule[] | undefined
): RuleChange[] {
  const prev = new Map((before ?? []).map((r) => [r.group, r]));
  const next = after ?? [];

  const changes: RuleChange[] = [];

  for (const rule of next) {
    const old = prev.get(rule.group);

    const change: RuleChange = {
      group: rule.group,
      before: toState(old),
      after: toState(rule),
      addedRegions: missing(rule.regions, old?.regions),
      removedRegions: missing(old?.regions, rule.regions),
      addedBrackets: sortBrackets(missing(rule.ageBrackets, old?.ageBrackets)).map(bracketLabel),
      removedBrackets: sortBrackets(missing(old?.ageBrackets, rule.ageBrackets)).map(bracketLabel),
    };

    const moved =
      change.addedRegions.length > 0 ||
      change.removedRegions.length > 0 ||
      change.addedBrackets.length > 0 ||
      change.removedBrackets.length > 0;

    if (moved) changes.push(change);
  }

  // 이번에 사라진 소속. 규칙이 통째로 빠졌다는 것도 알아야 한다
  for (const [group, old] of prev) {
    if (next.some((r) => r.group === group)) continue;
    if ((old.regions?.length ?? 0) === 0 && (old.ageBrackets?.length ?? 0) === 0) continue;

    changes.push({
      group,
      before: toState(old),
      after: { regions: [], brackets: [] },
      addedRegions: [],
      removedRegions: [...(old.regions ?? [])],
      addedBrackets: [],
      removedBrackets: sortBrackets([...(old.ageBrackets ?? [])]).map(bracketLabel),
    });
  }

  return changes;
}


/**
 * 이력을 날짜별로 묶는다.
 *
 * 기록이 쌓이면 한 표에 다 늘어놓을 수가 없다. 날짜를 먼저 고르고 그날 것만
 * 보게 하려면 "어느 날에 몇 건이 있는지"를 먼저 알아야 한다.
 *
 * 날짜는 보는 사람의 시간대로 가른다 — 서버가 UTC로 준 값을 그대로 자르면
 * 밤에 저장한 기록이 다음 날로 넘어가 있어 찾을 수가 없다.
 */

/** 하루치 묶음 */
export interface LogDay<T> {
  /** 같은 날인지 견주는 값 (2026-09-03) */
  key: string;
  /** 화면에 보일 이름 (2026년 9월 3일 목) */
  label: string;
  logs: T[];
}

/** 그 시각이 보는 사람 기준으로 어느 날인가 */
export function toLocalDayKey(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * @param logs      최신순으로 정렬된 이력
 * @param getDate   기록에서 시각을 꺼내는 함수
 * @returns 최신 날짜부터. 각 날짜 안에서는 받은 순서를 그대로 둔다
 */
export function groupLogsByDay<T>(logs: T[], getDate: (log: T) => Date): Array<LogDay<T>> {
  const days: Array<LogDay<T>> = [];

  for (const log of logs) {
    const at = getDate(log);
    const key = toLocalDayKey(at);

    const last = days[days.length - 1];
    if (last?.key === key) {
      last.logs.push(log);
      continue;
    }

    days.push({
      key,
      label: at.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      }),
      logs: [log],
    });
  }

  return days;
}

/**
 * 조회할 기간을 시각(ISO)으로 바꾼다.
 *
 * 날짜 경계는 보는 사람의 시간대에서 정해진다. 'YYYY-MM-DD'를 그대로 서버에
 * 넘기면 UTC로 잘려, 밤에 저장한 기록이 하루 밀려 안 보인다.
 *
 * 한쪽만 고른 상태도 쓸모가 있어 받아 준다 — 날짜 두 칸을 채우는 중에
 * 결과가 사라지면 뭘 잘못 눌렀나 싶다.
 *   - 시작만: 그날부터 오늘까지
 *   - 종료만: 처음부터 그날까지
 *
 * @returns 둘 다 비었거나 시작이 종료보다 늦으면 null
 */
export function toSearchRange(
  fromDay: string,
  toDay: string,
  now: Date = new Date()
): { from: string; to: string } | null {
  if (!fromDay && !toDay) return null;
  if (fromDay && toDay && fromDay > toDay) return null;

  const startOf = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  };
  const endOf = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999);
  };

  const from = fromDay ? startOf(fromDay) : new Date(0);
  const to = toDay
    ? endOf(toDay)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  return { from: from.toISOString(), to: to.toISOString() };
}
