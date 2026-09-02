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

/**
 * 소속이 아니라 계정 구분용이라 소속 필터에 노출하지 않는다.
 *
 * 관리자(admin)·서브관리자(subadmin)는 소속이 '관리자', DB담당자(staff)는 소속이
 * '담당자'다 — 둘 다 실제 조직이 아니라 그 역할들이 공통으로 쓰는 자리라,
 * 지사 계정을 만들 때 고를 수 있는 목록에는 안 보여야 한다.
 *
 * 소속 이름을 역할 이름('DB담당자')과 일부러 다르게 둔다. 담당자 유형이 앞으로
 * 늘어나도(민원담당자 등) 역할만 추가하면 되고 소속 행·숨김 목록은 그대로다.
 * 관리자와 서브관리자가 역할만 다르고 소속은 하나인 것과 같은 구조다.
 */
export const ADMIN_DEPARTMENT = '관리자';
export const STAFF_DEPARTMENT = '담당자';
const HIDDEN_DEPARTMENTS = [ADMIN_DEPARTMENT, STAFF_DEPARTMENT];

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
    if (HIDDEN_DEPARTMENTS.includes(dept.name)) continue;
    if (!groups.includes(dept.group_name)) {
      groups.push(dept.group_name);
    }
  }
  return groups;
}

/**
 * 사람에게 배정할 수 있는 소속인지. 화면에서 감춘 값이 API로 직접 오는 걸 막는다.
 *
 * '관리자'·'담당자'는 그 역할들 전용이라 지사 계정에는 못 붙인다 — 서버가 그
 * 값을 붙일 때(관리자 시드, DB담당자 생성)는 이 검사를 거치지 않고 직접 넣는다.
 */
export function isAssignableGroup(group: string): boolean {
  return !NON_ASSIGNABLE_GROUPS.includes(group) && !HIDDEN_DEPARTMENTS.includes(group);
}

/**
 * 소속 관리 화면·삭제 API에서 감춰야 하는 이름인가.
 *
 * '관리자'는 지금까지 departments.is_admin 플래그로 가렸다. '담당자'는 그런
 * 전용 플래그가 없어서(is_admin을 재사용하면 "관리자 소속이 둘"이 되어 그
 * 플래그를 보는 다른 코드가 깨진다) 이름으로 가린다.
 */
export function isHiddenDepartment(name: string): boolean {
  return HIDDEN_DEPARTMENTS.includes(name);
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
 * 지울 수 없는 소속인지. 지울 수 없으면 이유를 주고, 지울 수 있으면 null을 준다.
 *
 * 쪼개진 조직의 하위 분류(파라인슈1·파라인슈2)는 혼자 지울 수 없다.
 * 사용자는 조직('파라인슈')에 속하고 파일은 분류('파라인슈1')에 속해서,
 * 하나만 지우면 사용자는 그대로인데 파일만 갈 곳을 잃는다. 그 상태를 화면이
 * "0명의 사용자를 옮깁니다"로 안내해 실제로 2명이 있는데도 0명처럼 보였다.
 *
 * 조직을 없애려면 배정 규칙부터 바꿔야 하는 일이라 화면에서 지울 수 있게
 * 둘 이유가 없다.
 *
 * @param departments 전체 소속 목록. 형제 분류가 있는지 봐야 한다.
 */
export function getUndeletableReason(
  departments: DepartmentLike[] | undefined,
  deptName: string
): string | null {
  if (!Array.isArray(departments)) return null;

  const target = departments.find((d) => d.name === deptName);
  if (!target) return null;

  const siblings = departments.filter(
    (d) => d.group_name === target.group_name && d.name !== target.name
  );

  if (siblings.length > 0) {
    return `'${target.group_name}'은(는) ${siblings.length + 1}개 분류로 나뉘어 있어 하나만 삭제할 수 없습니다.`;
  }

  return null;
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
