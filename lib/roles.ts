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
 * - admin     : 관리자 (전체 권한)
 * - subadmin  : 서브관리자 (사용자·소속 관리를 제외한 관리자 권한)
 * - staff     : 담당자 (무엇을 하는지는 계정별 추가 권한이 정한다 —
 *               파일전달·민원 등록·사은품 관리를 하나씩 또는 겹쳐 맡는다)
 * - user      : 지사 (배포된 파일 다운로드, 재신청 고객·민원 열람)
 * - agent     : 설계사 (지사 밑. 자기에게 넘어온 민원을 처리하고 사은품을 신청한다)
 *
 * 'complaint'·'gift'는 담당자로 합쳐졌다. DB에는 남아 있지 않지만, 아직
 * 살아 있는 옛 토큰이 그 값을 들고 올 수 있어 판단에서는 계속 받아 준다.
 * 새로 만들 수는 없다(ASSIGNABLE_ROLES).
 */

export type Role = 'admin' | 'subadmin' | 'staff' | 'complaint' | 'user' | 'agent' | 'gift';

/** DB·JWT에서 온 값은 아직 문자열이라 좁혀서 받는다. */
type MaybeRole = Role | string | null | undefined;

/*
 * 계정별 추가 권한.
 *
 * 역할은 "누구인가"이고 이건 "그 역할에 더해 무엇을 더 할 수 있나"다.
 * DB담당자 한 명에게 민원 등록과 사은품 관리를 맡기려는데, 역할을 넓히면
 * 앞으로 만드는 DB담당자가 전부 그 권한을 받는다. 그래서 계정에 붙인다.
 *
 * 권한 검사 함수는 역할 문자열도, 역할과 추가 권한을 함께 든 계정도 받는다.
 * 추가 권한이 걸린 검사에는 계정을 넘겨야 한다 — 역할만 넘기면 그 권한은
 * 안 보인다. JWT와 로그인 응답에 함께 실린다(role과 같은 자리).
 */
export const EXTRA_PERMISSIONS = ['file_transfer', 'complaint_register', 'gift_manage'] as const;
export type ExtraPermission = (typeof EXTRA_PERMISSIONS)[number];

export const EXTRA_PERMISSION_LABEL: Record<ExtraPermission, string> = {
  file_transfer: 'DB전달',
  complaint_register: '민원 등록',
  gift_manage: '사은품 관리',
};

/** 추가 권한 하나가 여는 화면. 메뉴·화면 접근이 같은 표를 본다. */
const PERMISSION_ROUTE: Record<ExtraPermission, string> = {
  file_transfer: '/dashboard/file-transfer',
  complaint_register: '/dashboard/complaint-register',
  gift_manage: '/dashboard/gift-manage',
};

export function isExtraPermission(value: unknown): value is ExtraPermission {
  return typeof value === 'string' && (EXTRA_PERMISSIONS as readonly string[]).includes(value);
}

/** 역할과 추가 권한을 함께 든 것. JWT 페이로드·로그인 응답·화면의 user가 이 모양이다. */
export interface Actor {
  role?: MaybeRole;
  perms?: readonly string[] | null;
}

/** 검사 함수가 받는 것. 역할 문자열 하나여도 되고, 계정이어도 된다. */
export type Who = MaybeRole | Actor;

const roleOf = (who: Who): MaybeRole =>
  who && typeof who === 'object' ? who.role : who;

const permsOf = (who: Who): readonly string[] =>
  who && typeof who === 'object' ? (who.perms ?? []) : [];

const is = (who: Who, ...allowed: Role[]) => {
  const role = roleOf(who);
  return !!role && (allowed as string[]).includes(role);
};

/*
 * 합치기 전 역할값이 뜻하던 권한.
 *
 * DB의 계정은 마이그레이션으로 옮겼지만, 그 전에 로그인한 사람의 토큰에는
 * 아직 옛 역할이 들어 있다(추가 권한은 비어 있다). 그 토큰이 만료될 때까지
 * 하던 일을 계속할 수 있어야 해서, 옛 역할을 그때의 권한으로 읽어 준다.
 *
 * 'staff'는 추가 권한이 하나도 없을 때만 옛 뜻(파일전달)으로 읽는다 —
 * 새로 만든 담당자는 권한을 반드시 하나 이상 들고 있다.
 */
function legacyPerms(who: Who): readonly ExtraPermission[] {
  const role = roleOf(who);
  if (role === 'complaint') return ['complaint_register'];
  if (role === 'gift') return ['gift_manage'];
  if (role === 'staff' && permsOf(who).length === 0) return ['file_transfer'];
  return [];
}

/** 추가 권한을 들고 있는가. 관리자급은 굳이 들 필요가 없어 여기서는 안 본다. */
const has = (who: Who, perm: ExtraPermission) =>
  permsOf(who).includes(perm) || legacyPerms(who).includes(perm);

/** 관리자급 역할 (admin, subadmin) */
export const ADMIN_ROLES = ['admin', 'subadmin'] as const;

/** 원본을 저장소에 올릴 수 있는 역할. files/upload API가 쓴다. */
export const UPLOAD_ROLES = ['admin', 'subadmin', 'staff'] as const;

/**
 * 사용자 관리 화면으로 만들거나 바꿀 수 있는 역할.
 *
 * 관리자(admin)가 일부러 빠져 있다 — 요청자가 이미 관리자인 것과 별개로,
 * 그 화면이 관리자를 찍어내는 수단이 되면 안 된다.
 *
 * 만드는 쪽(POST)과 바꾸는 쪽(PATCH)이 같은 목록을 봐야 한다. 따로 적어 두면
 * 역할이 늘 때 한쪽만 고쳐져서, 만들 수는 있는데 바꿀 수는 없는 역할이 생긴다.
 */
export const ASSIGNABLE_ROLES = ['user', 'agent', 'staff', 'subadmin'] as const;

/** 사용자 관리 화면에서 지정할 수 있는 역할인가. */
export function isAssignableRole(role?: Who): boolean {
  const name = roleOf(role);
  return !!name && (ASSIGNABLE_ROLES as readonly string[]).includes(name);
}

/* ── 역할 자체를 묻는 것 ──────────────────────────────────────── */

/**
 * 관리자급(관리자 또는 서브관리자)인지.
 *
 * 권한이 아니라 "보는 범위"를 가를 때 쓴다 — 지사는 자기 소속 파일만,
 * 관리자급은 전체를 본다 같은 판단. 권한 검사에는 아래 can* 함수를 쓴다.
 */
export function isAdminRole(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/**
 * 담당자인지. 소속이 '담당자'로 고정되고, 하는 일은 추가 권한이 정한다.
 *
 * 옛 역할(complaint·gift)도 담당자로 본다 — DB에서는 옮겼지만 아직 살아 있는
 * 토큰이 그 값을 들고 온다.
 */
export function isStaffRole(role?: Who): boolean {
  return is(role, 'staff', 'complaint', 'gift');
}

/**
 * 설계사인지.
 *
 * "보는 범위"를 가를 때 쓴다 — 지사는 자기 소속 민원 전부를, 설계사는 그중
 * 자기에게 넘어온 것만 본다. 소속만으로는 이 둘을 구별할 수 없다.
 */
export function isAgentRole(role?: Who): boolean {
  return is(role, 'agent');
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
export function hasFixedDepartment(role?: Who): boolean {
  return isStaffRole(role) || is(role, 'subadmin');
}

/**
 * 실제 조직(파라인슈·경기 …)에 속한 계정인지.
 *
 * 지사와 그 밑의 설계사가 해당한다. 관리자·서브관리자·담당자 계열의 소속은
 * 역할 전용으로 예약된 이름이라 바뀔 일이 없어서, 소속 변경 이력 같은 건
 * 볼 것도 없다.
 */
export function belongsToOrganization(role?: Who): boolean {
  return is(role, 'user', 'agent');
}

/**
 * 화면에서 지울 수 없는 계정인지.
 *
 * 관리자를 지우면 되돌릴 방법이 없다 — 사용자 관리에 들어갈 수 있는 계정이
 * 사라지므로 다른 계정을 만들 수도, 역할을 올릴 수도 없다.
 */
export function isProtectedAccount(role?: Who): boolean {
  return is(role, 'admin');
}

/* ── 사용자·소속 관리 ─────────────────────────────────────────── */

/** 계정을 만들고 고치고 지울 수 있는가. 서브관리자는 못 한다. */
export function canManageUsers(role?: Who): boolean {
  return is(role, 'admin');
}

/** 소속을 만들고 지울 수 있는가. 서브관리자는 못 한다. */
export function canManageDepartments(role?: Who): boolean {
  return is(role, 'admin');
}

/* ── 파일 처리 ────────────────────────────────────────────────── */

/** 원본 파일을 저장소에 올릴 수 있는가. */
export function canUploadFiles(role?: Who): boolean {
  return is(role, 'admin', 'subadmin') || canUseFileTransfer(role);
}

/**
 * 파일전달 대기열(아직 분류 전인 원본)을 다룰 수 있는가.
 *
 * 담당자에게는 'DB전달' 권한을 켠 계정만 열린다. 옛 역할 'staff'만 들고 있는
 * 토큰도 받아 준다 — 그때는 그게 곧 파일전달이었다.
 */
export function canUseFileTransfer(role?: Who): boolean {
  return is(role, 'admin', 'subadmin') || has(role, 'file_transfer');
}

/** 원본을 분류하고 소속별로 배포할 수 있는가. DB담당자는 원본만 넘긴다. */
export function canClassifyAndDeploy(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 원본·배포본을 지우고 되살릴 수 있는가 (삭제 히스토리 포함). */
export function canManageFiles(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 배포된 파일을 받을 수 있는가. DB담당자는 받는 쪽이 아니라 넘기는 쪽이다. */
export function canDownloadDeployedFiles(role?: Who): boolean {
  return is(role, 'admin', 'subadmin', 'user');
}

/* ── 관리·조회 화면 ───────────────────────────────────────────── */

/** 대시보드(전체 통계)를 볼 수 있는가. */
export function canViewDashboard(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 다운로드 로그·로그인 기록 등 전 사용자의 기록을 볼 수 있는가. */
export function canViewAccessLogs(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 재다운로드 요청을 승인·거부할 수 있는가. */
export function canReviewDownloadRequests(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 블랙리스트를 보고 등록·해제할 수 있는가. */
export function canManageBlacklist(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/** 통합검색(파일·기록·블랙리스트를 한 번에 훑는 화면)을 쓸 수 있는가. */
export function canUseGlobalSearch(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/**
 * 재신청 고객 화면을 볼 수 있는가.
 *
 * 지사도 본다 — 다만 자기 소속 건만 보인다(canViewAllReapplyNotices 참고).
 * DB담당자는 원본을 넘기기만 하므로 이 화면과 무관하다.
 */
export function canViewReapplyNotices(role?: Who): boolean {
  return is(role, 'admin', 'subadmin', 'user');
}

/**
 * 재신청 알림을 소속 구분 없이 전부 볼 수 있는가.
 *
 * 지사도 이 화면을 쓰지만 자기 소속 건만 본다. 이 함수는 "전체를 보는가"만
 * 가른다 — 화면 접근 자체를 막는 것과는 다르다.
 */
export function canViewAllReapplyNotices(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/* ── 민원 ─────────────────────────────────────────────────────── */

/**
 * 민원을 접수(입력)할 수 있는가.
 *
 * 민원담당자가 메일로 받은 내역을 화면에 옮겨 적는다. 올린 사람은 자기가
 * 넣은 건의 처리 결과까지 이 화면에서 본다 — 그래서 등록과 조회가 한 화면이다.
 */
export function canRegisterComplaints(role?: Who): boolean {
  return is(role, 'admin', 'subadmin') || has(role, 'complaint_register');
}

/**
 * 배정된 민원 화면을 볼 수 있는가.
 *
 * 지사는 자기 소속 건, 설계사는 자기에게 넘어온 건만 본다
 * (canViewAllComplaints 참고). 민원을 넣는 담당자는 여기 못 들어온다 —
 * 지사별 처리 상황은 이 화면이고, 담당자는 등록 화면에서 넣은 건을 본다.
 */
export function canViewComplaints(role?: Who): boolean {
  return is(role, 'admin', 'subadmin', 'user');
}

/** 민원을 소속 구분 없이 전부 볼 수 있는가. */
export function canViewAllComplaints(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/**
 * 담당 지사를 못 찾은 민원을 직접 처리할 수 있는가.
 *
 * 지사를 지정하거나 민원담당자에게 반려한다. 자동으로 못 찾았다는 건 기록에
 * 없는 고객이라는 뜻이라, 판단이 필요해서 관리자급만 만진다.
 */
export function canResolveUnassignedComplaints(role?: Who): boolean {
  return is(role, 'admin', 'subadmin');
}

/**
 * 민원을 처리할 수 있는가 — 확인·처리 내용·"우리 지사 건 아님".
 *
 * 지사의 일이다. 관리자급도 대신 할 수 있다 — 지사가 며칠째 안 하면
 * 누군가는 해야 한다. 누가 했는지는 기록에 남는다.
 */
export function canHandleComplaint(role?: Who): boolean {
  return is(role, 'admin', 'subadmin', 'user');
}

/* ── 사은품 ───────────────────────────────────────────────────── */

/**
 * 사은품 신청 화면을 볼 수 있는가.
 *
 * **지금은 지사가 맡는다.** 지사가 소속 건을 모아 넣고, 모아서 사은품담당자에게
 * 넘긴다. 설계사가 개인별로 넣는 것은 나중에 연다 — 그때 이 함수와 아래
 * canRequestGift 에 'agent'를 되돌리면 화면·API·메뉴가 함께 열린다.
 *
 * 사은품담당자는 여기 못 들어온다 — 전달되기 전 신청은 지사 안의 일이고,
 * 담당자에게는 전달된 것만 사은품 관리 화면으로 온다.
 */
export function canViewGiftRequests(role?: Who): boolean {
  return is(role, 'admin', 'subadmin', 'user');
}

/**
 * 사은품을 신청할 수 있는가.
 *
 * 지사가 넣는다. 신청과 전달이 같은 사람 일이라도 두 단계는 그대로 둔다 —
 * "모아서 한 번에 보낸다"가 이 흐름의 뜻이라, 며칠치를 넣어 두고 한 번에
 * 골라 보내려면 등록과 전달이 갈려 있어야 한다.
 */
export function canRequestGift(role?: Who): boolean {
  return is(role, 'admin', 'subadmin', 'user');
}

/**
 * 소속 설계사의 신청을 사은품담당자에게 전달할 수 있는가.
 *
 * 지사의 일이다. 설계사는 자기 것을 넣기만 하고 넘기지는 못한다 — 지사가
 * 한 번 보고 묶어서 보내는 것이 이 흐름의 뜻이다.
 */
export function canForwardGiftRequests(role?: Who): boolean {
  return is(role, 'admin', 'subadmin', 'user');
}

/**
 * 사은품 관리 화면(전달받은 신청을 발주하고 보완을 요청하는 곳)을 쓸 수 있는가.
 */
export function canManageGiftRequests(role?: Who): boolean {
  return is(role, 'admin', 'subadmin') || has(role, 'gift_manage');
}

/** 사은품 신청을 소속 구분 없이 전부 볼 수 있는가. */
export function canViewAllGiftRequests(role?: Who): boolean {
  return is(role, 'admin', 'subadmin') || has(role, 'gift_manage');
}

/* ── 화면 접근 ────────────────────────────────────────────────── */

/**
 * 역할별 첫 화면.
 *
 * 루트('/')로 들어왔을 때와, 못 들어가는 화면에서 되돌려 보낼 때 같은 곳을
 * 써야 한다 — 다르면 되돌려 보낸 화면에서 또 튕겨 무한 리다이렉트가 된다.
 */
export function getLandingRoute(role?: Who): string {
  if (isAdminRole(role)) return '/dashboard';
  /*
   * 담당자는 켜 준 권한 중 첫 화면으로 보낸다. 아무것도 안 켜 준 계정은
   * 갈 데가 없어 파일전달로 둔다 — 빈 화면보다는 "권한이 없습니다"가 낫다.
   */
  if (isStaffRole(role)) {
    const first = EXTRA_PERMISSIONS.find((perm) => has(role, perm));
    return first ? PERMISSION_ROUTE[first] : '/dashboard/file-transfer';
  }
  // 설계사는 파일을 받지 않는다. 민원은 지사가 처리하므로 사은품 신청만 본다.
  if (isAgentRole(role)) return '/dashboard/gift-requests';
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
export function getAllowedDashboardRoutes(role?: Who): string[] | null {
  if (isAdminRole(role)) return null;

  let base: string[];
  /*
   * 담당자는 켜 준 권한만큼만 열린다.
   *
   * 민원 등록은 사무실에서 넣은 건을 보는 화면이다 — 배정된 민원
   * ('/dashboard/complaints')은 지사별 처리 상황이라 열지 않는다.
   * 사은품 관리도 전달된 신청만 본다. 지사 안에서 오가는 신청 화면은 아니다.
   */
  if (isStaffRole(role)) base = [];
  // 설계사는 사은품 신청만. 민원은 지사가 처리한다.
  else if (isAgentRole(role)) base = ['/dashboard/gift-requests'];
  else
    base = [
      '/dashboard/download',
      '/dashboard/reapply',
      '/dashboard/complaints',
      '/dashboard/gift-requests',
    ];

  /*
   * 추가 권한만큼 화면을 더 연다. 메뉴(Sidebar)·API가 같은 함수(can*)로
   * 판단하므로 여기서만 따로 정하면 메뉴는 뜨는데 화면이 튕기거나 그 반대가 된다.
   */
  const extra = EXTRA_PERMISSIONS.filter((perm) => has(role, perm)).map((perm) => PERMISSION_ROUTE[perm]);
  const routes = [...new Set([...base, ...extra])];
  /*
   * 아무 화면도 없으면 갈 곳이 없어 미들웨어가 첫 화면으로 되돌리고, 그
   * 첫 화면이 또 막혀 무한히 돈다. 권한을 안 켜 준 담당자에게 그 일이 난다.
   */
  return routes.length > 0 ? routes : ['/dashboard/file-transfer'];
}
