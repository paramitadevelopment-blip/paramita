/**
 * "이 역할이 무엇을 할 수 있는가"를 한 곳에 모은다.
 *
 * 라우트마다 `role !== 'admin' && role !== 'subadmin'`처럼 역할 이름을 직접
 * 비교하면, 역할이 하나 늘 때마다 그 조건들을 전부 찾아 "새 역할은 여기
 * 포함인가"를 판단해야 한다. 하나만 빠뜨려도 조용히 권한이 열리거나 막힌다.
 *
 * 그래서 조건을 "누구인가"가 아니라 "무엇을 할 수 있는가"로 적는다.
 * 새 역할이 생기면 이 파일의 함수 목록만 훑으면 되고, 그 판단이 코드에
 * 문장으로 남는다.
 *
 * 지금은 여러 함수가 같은 역할 집합을 돌려주지만 합치지 않는다 — 오늘 같다고
 * 내일도 같을 이유가 없다. 예를 들어 민원담당자가 생기면 재신청 고객은 보되
 * 분류·배포는 못 하게 갈릴 수 있는데, 그때 합쳐 둔 함수는 다시 쪼개야 한다.
 *
 * 역할
 * - admin    : 관리자 (전체 권한)
 * - subadmin : 서브관리자 (사용자·소속 관리를 제외한 관리자 권한)
 * - staff    : DB담당자 (파일전달로 원본만 넘긴다)
 * - user     : 지사 (배포된 파일 다운로드, 재신청 고객 열람)
 */

export type Role = 'admin' | 'subadmin' | 'staff' | 'user';

/** DB·JWT에서 온 값은 아직 문자열이라 좁혀서 받는다. */
type MaybeRole = Role | string | null | undefined;

const is = (role: MaybeRole, ...allowed: Role[]) =>
  !!role && (allowed as string[]).includes(role);

/** 관리자급 역할 (admin, subadmin) */
export const ADMIN_ROLES = ['admin', 'subadmin'] as const;

/** 원본을 저장소에 올릴 수 있는 역할. files/upload API가 쓴다. */
export const UPLOAD_ROLES = ['admin', 'subadmin', 'staff'] as const;

/* ── 역할 자체를 묻는 것 ──────────────────────────────────────── */

/**
 * 관리자급(관리자 또는 서브관리자)인지.
 *
 * 권한이 아니라 "보는 범위"를 가를 때 쓴다 — 지사는 자기 소속 파일만,
 * 관리자급은 전체를 본다 같은 판단. 권한 검사에는 아래 can* 함수를 쓴다.
 */
export function isAdminRole(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin');
}

/** DB담당자인지. 그 역할에만 해당하는 동작(업로드 출처 고정 등)에 쓴다. */
export function isStaffRole(role?: MaybeRole): boolean {
  return is(role, 'staff');
}

/**
 * 계정을 만들거나 고칠 때 소속을 서버가 정해 주는 역할인지.
 *
 * 서브관리자는 '관리자', DB담당자는 '담당자'로 고정된다. 지사만 실제 조직을
 * 골라야 하므로 소속이 필수다.
 *
 * 관리자(admin)는 일부러 뺀다. 이 화면으로는 관리자를 만들 수도 역할을 바꿀
 * 수도 없어서(ASSIGNABLE_ROLES) 여기 걸릴 일이 없는데, 넣어 두면 관리자가
 * 자기 정보를 고칠 때 소속이 통째로 덮인다.
 */
export function hasFixedDepartment(role?: MaybeRole): boolean {
  return is(role, 'staff', 'subadmin');
}

/**
 * 실제 조직(파라인슈·경기 …)에 속한 계정인지.
 *
 * 지사만 해당한다. 관리자·서브관리자·DB담당자의 소속은 역할 전용으로 예약된
 * 이름이라 바뀔 일이 없어서, 소속 변경 이력 같은 건 볼 것도 없다.
 */
export function belongsToOrganization(role?: MaybeRole): boolean {
  return is(role, 'user');
}

/**
 * 화면에서 지울 수 없는 계정인지.
 *
 * 관리자를 지우면 되돌릴 방법이 없다 — 사용자 관리에 들어갈 수 있는 계정이
 * 사라지므로 다른 계정을 만들 수도, 역할을 올릴 수도 없다.
 */
export function isProtectedAccount(role?: MaybeRole): boolean {
  return is(role, 'admin');
}

/* ── 사용자·소속 관리 ─────────────────────────────────────────── */

/** 계정을 만들고 고치고 지울 수 있는가. 서브관리자는 못 한다. */
export function canManageUsers(role?: MaybeRole): boolean {
  return is(role, 'admin');
}

/** 소속을 만들고 지울 수 있는가. 서브관리자는 못 한다. */
export function canManageDepartments(role?: MaybeRole): boolean {
  return is(role, 'admin');
}

/* ── 파일 처리 ────────────────────────────────────────────────── */

/** 원본 파일을 저장소에 올릴 수 있는가. */
export function canUploadFiles(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin', 'staff');
}

/** 파일전달 대기열(아직 분류 전인 원본)을 다룰 수 있는가. */
export function canUseFileTransfer(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin', 'staff');
}

/** 원본을 분류하고 소속별로 배포할 수 있는가. DB담당자는 원본만 넘긴다. */
export function canClassifyAndDeploy(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 원본·배포본을 지우고 되살릴 수 있는가 (삭제 히스토리 포함). */
export function canManageFiles(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 배포된 파일을 받을 수 있는가. DB담당자는 받는 쪽이 아니라 넘기는 쪽이다. */
export function canDownloadDeployedFiles(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin', 'user');
}

/* ── 관리·조회 화면 ───────────────────────────────────────────── */

/** 대시보드(전체 통계)를 볼 수 있는가. */
export function canViewDashboard(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 다운로드 로그·로그인 기록 등 전 사용자의 기록을 볼 수 있는가. */
export function canViewAccessLogs(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 재다운로드 요청을 승인·거부할 수 있는가. */
export function canReviewDownloadRequests(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 블랙리스트를 보고 등록·해제할 수 있는가. */
export function canManageBlacklist(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 통합검색(파일·기록·블랙리스트를 한 번에 훑는 화면)을 쓸 수 있는가. */
export function canUseGlobalSearch(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin');
}

/**
 * 재신청 고객 화면을 볼 수 있는가.
 *
 * 지사도 본다 — 다만 자기 소속 건만 보인다(canViewAllReapplyNotices 참고).
 * DB담당자는 원본을 넘기기만 하므로 이 화면과 무관하다.
 */
export function canViewReapplyNotices(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin', 'user');
}

/**
 * 재신청 알림을 소속 구분 없이 전부 볼 수 있는가.
 *
 * 지사도 이 화면을 쓰지만 자기 소속 건만 본다. 이 함수는 "전체를 보는가"만
 * 가른다 — 화면 접근 자체를 막는 것과는 다르다.
 */
export function canViewAllReapplyNotices(role?: MaybeRole): boolean {
  return is(role, 'admin', 'subadmin');
}

/* ── 화면 접근 ────────────────────────────────────────────────── */

/**
 * 역할별 첫 화면.
 *
 * 루트('/')로 들어왔을 때와, 못 들어가는 화면에서 되돌려 보낼 때 같은 곳을
 * 써야 한다 — 다르면 되돌려 보낸 화면에서 또 튕겨 무한 리다이렉트가 된다.
 */
export function getLandingRoute(role?: MaybeRole): string {
  if (isAdminRole(role)) return '/dashboard';
  if (isStaffRole(role)) return '/dashboard/file-transfer';
  return '/dashboard/download';
}

/**
 * 이 역할이 들어갈 수 있는 대시보드 화면. null이면 제한 없음(관리자급).
 *
 * 여기 없는 /dashboard 하위 경로는 전부 막힌다. 역할을 새로 추가하면 이
 * 목록을 반드시 정해야 한다 — 안 정하면 지사와 같은 화면만 보게 된다.
 *
 * DB담당자와 지사의 목록을 따로 두는 이유: 하나로 합치면 지사가 파일전달을,
 * DB담당자가 파일 다운로드를 볼 수 있게 된다.
 *
 * 재신청 고객은 지사가 자기 소속 건만 본다. 무엇을 보여줄지는 API가 소속으로
 * 거르므로 여기서는 화면에 들어올 수 있게만 열어 준다.
 */
export function getAllowedDashboardRoutes(role?: MaybeRole): string[] | null {
  if (isAdminRole(role)) return null;
  if (isStaffRole(role)) return ['/dashboard/file-transfer'];
  return ['/dashboard/download', '/dashboard/reapply'];
}
