/**
 * 배정 규칙 — "어느 소속이 어느 지역·나이대를 받는가".
 *
 * 예전에는 이 내용이 코드 상수로 박혀 있어(DEPT_BY_REGION 등) 지사가 늘거나
 * 담당이 바뀔 때마다 배포를 해야 했다. 이제는 화면에서 설정한 값을 DB에서 읽어
 * 이 함수들이 판정한다.
 *
 * 지역과 나이는 AND로 걸린다. 경기지사가 '서울'과 '70세미만'을 골랐다면,
 * 서울에서 온 70~75세 건은 경기지사 대상이 아니다.
 */

import type { Region } from '@/lib/assignmentRegions';

/**
 * 나이 구간. 기존 배정이 70세·75세로 갈랐던 선을 그대로 쓴다.
 * 값을 화면·DB·판정이 같이 쓰므로 문자열을 여기 한 곳에만 둔다.
 */
export const AGE_BRACKETS = ['under70', '70to75', 'over75'] as const;
export type AgeBracket = (typeof AGE_BRACKETS)[number];

/** 화면에 보일 이름 */
export const AGE_BRACKET_LABEL: Record<AgeBracket, string> = {
  under70: '70세 미만',
  '70to75': '70~75세',
  over75: '75세 이상',
};

/**
 * 한 소속이 받기로 한 조건.
 * 지역과 나이를 따로 갖고, 판정할 때 둘 다 맞아야 한다.
 */
export interface DepartmentRule {
  /** 조직 이름 (departments.group_name) */
  group: string;
  regions: Region[];
  ageBrackets: AgeBracket[];
}

/**
 * 보험나이 → 구간.
 *
 * 경계는 기존 규칙과 같다 — 70 미만 / 70 이상 75 미만 / 75 이상.
 * 나이를 못 읽은 건(-1)은 여기 오기 전에 오류로 걸러진다.
 */
export function toAgeBracket(age: number): AgeBracket {
  if (age < 70) return 'under70';
  if (age < 75) return '70to75';
  return 'over75';
}

/**
 * 이 지역·나이를 받기로 한 소속들.
 *
 * 결과가
 *   1개  → 그 소속으로 자동배정
 *   2개+ → 사람이 고른다 (여럿이 같은 조건을 맡고 있다)
 *   0개  → 사람이 고른다 (아무도 안 맡은 조합이라 그냥 두면 사라진다)
 *
 * 어느 쪽이든 조용히 버리지 않는 게 요점이다.
 *
 * 설정한 순서와 무관하게 같은 결과가 나오도록 이름순으로 정렬해 돌려준다 —
 * 자동배분이 "같으면 앞엣것"을 고르므로 순서가 흔들리면 결과도 흔들린다.
 */
export function matchDepartments(
  rules: DepartmentRule[],
  region: Region,
  bracket: AgeBracket
): string[] {
  return rules
    .filter((rule) => rule.regions.includes(region) && rule.ageBrackets.includes(bracket))
    .map((rule) => rule.group)
    .sort((a, b) => a.localeCompare(b, 'ko-KR'));
}

/** 설정이 덜 된 소속과 무엇이 빠졌는지 */
export interface IncompleteRule {
  group: string;
  /** 지역을 하나도 안 골랐는가 */
  noRegion: boolean;
  /** 나이대를 하나도 안 골랐는가 */
  noAgeBracket: boolean;
}

/**
 * 설정이 덜 된 소속들.
 *
 * 지역과 나이는 AND로 걸리므로 한쪽이 비면 그 소속은 아무 건도 받지 못한다.
 * 그런데 화면상으로는 체크가 몇 개 되어 있어 설정된 것처럼 보이고, 배정에서는
 * 조용히 빠져 그 지역 건이 전부 수동배정으로 떨어진다. 왜 그런지 알아채기까지
 * 오래 걸리므로 저장 자체를 막는다.
 *
 * 화면과 서버가 같은 판정을 써야 한다 — 화면에서만 막으면 API로는 그대로 들어온다.
 */
export function findIncompleteRules(rules: DepartmentRule[] | undefined): IncompleteRule[] {
  const incomplete: IncompleteRule[] = [];

  for (const rule of rules ?? []) {
    const noRegion = (rule?.regions?.length ?? 0) === 0;
    const noAgeBracket = (rule?.ageBrackets?.length ?? 0) === 0;
    if (noRegion || noAgeBracket) {
      incomplete.push({ group: String(rule?.group ?? ''), noRegion, noAgeBracket });
    }
  }

  return incomplete;
}

/** 무엇이 빠졌는지 한 줄로. 화면과 서버가 같은 문구를 쓰도록 여기 둔다 */
export function describeIncomplete(item: IncompleteRule): string {
  if (item.noRegion && item.noAgeBracket) return '지역·나이 모두 선택 안 됨';
  return item.noRegion ? '지역 선택 안 됨' : '나이 선택 안 됨';
}
