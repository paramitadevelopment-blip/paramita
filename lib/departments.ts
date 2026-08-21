/**
 * 소속(departments)은 두 가지를 겸한다.
 *   - 파일 배정 분류: 배정 규칙이 만들어내는 값 (파라인슈1, 파라인슈2)
 *   - 사용자 소속: 실제 조직 (파라인슈)
 * 대부분은 둘이 1:1이라 group_name이 곧 name이고, 파라인슈만 1:N이다.
 * 화면에서 "소속"을 고르는 자리는 조직 단위여야 하므로 여기서 접어서 쓴다.
 */

export interface DepartmentLike {
  id: number;
  name: string;
  group_name: string;
}

/** 소속이 아니라 계정 구분용이라 소속 필터에 노출하지 않는다. */
const HIDDEN_DEPARTMENT = '관리자';

/**
 * 배정 분류로만 쓰이고 사람이 속하지는 않는 소속.
 * '이외지역'은 주소를 읽을 수 없는 건이 모이는 자리라 파일은 생기지만 담당 조직이 아니다.
 * 파일 필터에는 그대로 나와야 하므로 여기서만 걸러낸다.
 */
const NON_ASSIGNABLE_GROUPS = ['이외지역'];

/**
 * 소속 목록을 조직 단위로 접는다.
 * 파라인슈1·파라인슈2는 '파라인슈' 한 줄이 된다.
 */
export function toDepartmentGroups(departments: DepartmentLike[] | undefined): string[] {
  if (!Array.isArray(departments)) return [];

  const groups: string[] = [];
  for (const dept of departments) {
    if (dept.name === HIDDEN_DEPARTMENT) continue;
    if (!groups.includes(dept.group_name)) {
      groups.push(dept.group_name);
    }
  }
  return groups;
}

/** 사람에게 배정할 수 있는 소속인지. 화면에서 감춘 값이 API로 직접 오는 걸 막는다. */
export function isAssignableGroup(group: string): boolean {
  return !NON_ASSIGNABLE_GROUPS.includes(group);
}

/**
 * 사람에게 배정할 수 있는 조직만 준다. 사용자 등록·수정의 소속 선택에 쓴다.
 */
export function toAssignableDepartmentGroups(
  departments: DepartmentLike[] | undefined
): string[] {
  return toDepartmentGroups(departments).filter(
    (group) => !NON_ASSIGNABLE_GROUPS.includes(group)
  );
}

/**
 * 한 조직이 쪼개져 있을 때 그 하위 분류들을 준다.
 * 쪼개지지 않은 조직(하위가 1개)은 보여줄 게 없으므로 빈 배열을 준다.
 */
export function getSubDepartments(
  departments: DepartmentLike[] | undefined,
  groupName: string
): string[] {
  if (!Array.isArray(departments) || !groupName) return [];

  const subs = departments
    .filter((dept) => dept.group_name === groupName)
    .map((dept) => dept.name)
    .sort((a, b) => a.localeCompare(b));

  return subs.length > 1 ? subs : [];
}
