import { describe, it, expect } from 'vitest';
import {
  isAssignableRole,
  type Role,
  isAdminRole,
  isStaffRole,
  isProtectedAccount,
  hasFixedDepartment,
  belongsToOrganization,
  canManageUsers,
  canManageDepartments,
  canUploadFiles,
  canUseFileTransfer,
  canClassifyAndDeploy,
  canManageFiles,
  canDownloadDeployedFiles,
  canViewDashboard,
  canViewAccessLogs,
  canReviewDownloadRequests,
  canManageBlacklist,
  canUseGlobalSearch,
  canViewReapplyNotices,
  canViewAllReapplyNotices,
  isAgentRole,
  canRegisterComplaints,
  canViewComplaints,
  canViewAllComplaints,
  canResolveUnassignedComplaints,
  canHandleComplaint,
  canViewGiftRequests,
  canRequestGift,
  canForwardGiftRequests,
  canManageGiftRequests,
  canViewAllGiftRequests,
  getLandingRoute,
  getAllowedDashboardRoutes,
  isExtraPermission,
} from '@/lib/roles';

/**
 * 권한표.
 *
 * 라우트마다 흩어져 있던 역할 조건을 lib/roles.ts로 모았으므로, 이 표가 곧
 * 시스템의 권한 정의다. 역할을 하나 추가하면 아래 ROLES에 넣는 순간 모든
 * 항목에서 "이 역할은 되는가"를 정해야 테스트가 통과한다 — 빠뜨리고 넘어갈
 * 수가 없다. 그게 이 표의 목적이다.
 */
const ROLES: Role[] = ['admin', 'subadmin', 'staff', 'complaint', 'user', 'agent', 'gift'];

const MATRIX: Array<{ name: string; fn: (r?: string | null) => boolean; allowed: Role[] }> = [
  // 역할 자체를 묻는 것
  { name: 'isAdminRole', fn: isAdminRole, allowed: ['admin', 'subadmin'] },
  // 담당자 하나로 합쳤다. 옛 역할값(complaint·gift)도 담당자로 본다 —
  // DB에서는 옮겼지만 아직 살아 있는 토큰이 그 값을 들고 온다.
  { name: 'isStaffRole', fn: isStaffRole, allowed: ['staff', 'complaint', 'gift'] },
  { name: 'isAgentRole', fn: isAgentRole, allowed: ['agent'] },
  { name: 'isProtectedAccount', fn: isProtectedAccount, allowed: ['admin'] },
  {
    name: 'hasFixedDepartment',
    fn: hasFixedDepartment,
    allowed: ['subadmin', 'staff', 'complaint', 'gift'],
  },
  // 설계사도 실제 조직(지사)에 속한다. 소속이 아니라 역할로 지사와 갈린다.
  { name: 'belongsToOrganization', fn: belongsToOrganization, allowed: ['user', 'agent'] },

  // 사용자·소속 관리 — 서브관리자는 못 한다
  { name: 'canManageUsers', fn: canManageUsers, allowed: ['admin'] },
  { name: 'canManageDepartments', fn: canManageDepartments, allowed: ['admin'] },

  // 파일 처리
  { name: 'canUploadFiles', fn: canUploadFiles, allowed: ['admin', 'subadmin', 'staff'] },
  { name: 'canUseFileTransfer', fn: canUseFileTransfer, allowed: ['admin', 'subadmin', 'staff'] },
  { name: 'canClassifyAndDeploy', fn: canClassifyAndDeploy, allowed: ['admin', 'subadmin'] },
  { name: 'canManageFiles', fn: canManageFiles, allowed: ['admin', 'subadmin'] },
  {
    name: 'canDownloadDeployedFiles',
    fn: canDownloadDeployedFiles,
    allowed: ['admin', 'subadmin', 'user'],
  },

  // 관리·조회 화면
  { name: 'canViewDashboard', fn: canViewDashboard, allowed: ['admin', 'subadmin'] },
  { name: 'canViewAccessLogs', fn: canViewAccessLogs, allowed: ['admin', 'subadmin'] },
  {
    name: 'canReviewDownloadRequests',
    fn: canReviewDownloadRequests,
    allowed: ['admin', 'subadmin'],
  },
  { name: 'canManageBlacklist', fn: canManageBlacklist, allowed: ['admin', 'subadmin'] },
  { name: 'canUseGlobalSearch', fn: canUseGlobalSearch, allowed: ['admin', 'subadmin'] },
  {
    name: 'canViewReapplyNotices',
    fn: canViewReapplyNotices,
    allowed: ['admin', 'subadmin', 'user'],
  },
  {
    name: 'canViewAllReapplyNotices',
    fn: canViewAllReapplyNotices,
    allowed: ['admin', 'subadmin'],
  },

  // 민원 — 넣는 사람(민원담당자)과 받는 사람(지사·설계사)이 갈린다
  {
    name: 'canRegisterComplaints',
    fn: canRegisterComplaints,
    allowed: ['admin', 'subadmin', 'complaint'],
  },
  {
    name: 'canViewComplaints',
    fn: canViewComplaints,
    allowed: ['admin', 'subadmin', 'user'],
  },
  { name: 'canViewAllComplaints', fn: canViewAllComplaints, allowed: ['admin', 'subadmin'] },
  {
    name: 'canResolveUnassignedComplaints',
    fn: canResolveUnassignedComplaints,
    allowed: ['admin', 'subadmin'],
  },
  {
    name: 'canHandleComplaint',
    fn: canHandleComplaint,
    allowed: ['admin', 'subadmin', 'user'],
  },

  // 사은품 — 설계사가 신청하고, 지사가 전달하고, 사은품담당자가 발주한다.
  // 사은품담당자는 신청 화면에 못 들어가고, 설계사는 전달하지 못한다.
  // 지금은 지사가 맡는다. 설계사 개인 신청을 열면 여기에 'agent'가 돌아온다.
  { name: 'canViewGiftRequests', fn: canViewGiftRequests, allowed: ['admin', 'subadmin', 'user'] },
  { name: 'canRequestGift', fn: canRequestGift, allowed: ['admin', 'subadmin', 'user'] },
  {
    name: 'canForwardGiftRequests',
    fn: canForwardGiftRequests,
    allowed: ['admin', 'subadmin', 'user'],
  },
  {
    name: 'canManageGiftRequests',
    fn: canManageGiftRequests,
    allowed: ['admin', 'subadmin', 'gift'],
  },
  {
    name: 'canViewAllGiftRequests',
    fn: canViewAllGiftRequests,
    allowed: ['admin', 'subadmin', 'gift'],
  },
];

describe('권한표 — 역할별로 무엇을 할 수 있는가', () => {
  for (const { name, fn, allowed } of MATRIX) {
    describe(name, () => {
      for (const role of ROLES) {
        const expected = allowed.includes(role);
        it(`${role} → ${expected}`, () => {
          expect(fn(role)).toBe(expected);
        });
      }

      /**
       * 모르는 값은 막는 쪽이 기본이어야 한다. 열어두면 역할 이름을 잘못 적은
       * 토큰이 통과하고, 그게 조용히 권한을 여는 경로가 된다.
       */
      it('빈 값·모르는 값은 막는다', () => {
        expect(fn('')).toBe(false);
        expect(fn(null)).toBe(false);
        expect(fn(undefined)).toBe(false);
        expect(fn('manager')).toBe(false);
      });
    });
  }
});

describe('화면 접근', () => {
  it('관리자급은 화면 제한이 없다', () => {
    expect(getAllowedDashboardRoutes('admin')).toBeNull();
    expect(getAllowedDashboardRoutes('subadmin')).toBeNull();
  });

  it('DB담당자는 파일전달만 본다 — 지사 화면은 못 본다', () => {
    const routes = getAllowedDashboardRoutes('staff')!;
    expect(routes).toContain('/dashboard/file-transfer');
    expect(routes).not.toContain('/dashboard/download');
  });

  it('지사는 다운로드·재신청만 본다 — 파일전달은 못 본다', () => {
    const routes = getAllowedDashboardRoutes('user')!;
    expect(routes).toContain('/dashboard/download');
    expect(routes).toContain('/dashboard/reapply');
    expect(routes).not.toContain('/dashboard/file-transfer');
  });

  /**
   * 첫 화면이 그 역할의 허용 목록 밖이면, 튕겨낸 자리에서 또 튕겨 무한
   * 리다이렉트가 된다. 역할을 추가할 때 가장 놓치기 쉬운 자리라 못 박아 둔다.
   */
  it('첫 화면은 반드시 그 역할이 들어갈 수 있는 곳이다', () => {
    for (const role of ROLES) {
      const landing = getLandingRoute(role);
      const allowed = getAllowedDashboardRoutes(role);
      if (allowed === null) continue; // 제한 없음
      const reachable = allowed.some(
        (route) => landing === route || landing.startsWith(route + '/')
      );
      expect(reachable, `${role}의 첫 화면 ${landing}에 들어갈 수 없다`).toBe(true);
    }
  });

  /*
   * 모르는 값이 오면 지사와 같은 화면만 받는다. 목록이 늘어나는 건 그 화면이
   * 지사에게 열렸다는 뜻이므로 여기도 같이 늘어난다 — 다만 파일전달·사용자
   * 관리처럼 관리자급 화면이 이 목록에 새어 들어오면 안 된다.
   */
  it('모르는 역할은 지사와 같은 화면만 받는다', () => {
    expect(getAllowedDashboardRoutes('manager')).toEqual([
      '/dashboard/download',
      '/dashboard/reapply',
      '/dashboard/complaints',
      '/dashboard/gift-requests',
    ]);
  });

  /**
   * 설계사는 지사 밑이지만 배포된 DB를 받는 사람이 아니다.
   * 파일 다운로드가 열리면 자기 고객이 아닌 명단까지 통째로 가져간다.
   */
  /*
   * 설계사는 지사 밑이지만 배포된 DB를 받는 사람이 아니다.
   * 민원은 지사가 처리하므로 설계사에게는 사은품 신청 화면만 남는다.
   */
  it('설계사는 사은품 신청 화면만 들어간다 — 민원은 지사가 처리한다', () => {
    expect(getAllowedDashboardRoutes('agent')).toEqual(['/dashboard/gift-requests']);
  });

  /** 사은품담당자는 전달된 것만 본다. 지사 안에서 오가는 신청 화면은 열지 않는다. */
  it('사은품담당자는 사은품 관리 화면만 들어간다', () => {
    expect(getAllowedDashboardRoutes('gift')).toEqual(['/dashboard/gift-manage']);
  });

  /** 민원담당자는 자기가 넣은 건만 본다. 남의 지사 처리 상황은 보지 않는다. */
  it('민원담당자는 민원 등록 화면만 들어간다', () => {
    expect(getAllowedDashboardRoutes('complaint')).toEqual(['/dashboard/complaint-register']);
  });
});

/**
 * 계정별 추가 권한.
 *
 * 역할은 그대로 두고 계정 하나에만 화면을 더 연다. DB담당자 한 명에게 민원
 * 등록과 사은품 관리를 맡기되, 다음에 만드는 DB담당자는 파일전달만 하게.
 */
describe('계정별 추가 권한', () => {
  const staff = { role: 'staff', perms: [] as string[] };
  const staffPlus = { role: 'staff', perms: ['complaint_register', 'gift_manage'] };

  it('담당자 역할만으로는 안 열린다 — 켜 준 일만 한다', () => {
    // perms를 빈 배열로 명시했으므로 옛 역할로도 안 읽힌다.
    expect(canRegisterComplaints(staff)).toBe(false);
    expect(canManageGiftRequests(staff)).toBe(false);
    expect(canViewAllGiftRequests(staff)).toBe(false);
    /*
     * 파일전달만은 열린다 — 권한이 하나도 없는 'staff'는 합치기 전의
     * DB담당자 토큰과 구별할 수 없어 그때의 뜻으로 읽는다. 새로 만드는
     * 담당자는 화면과 서버가 권한을 하나 이상 받으므로 이 상태가 안 된다.
     */
    expect(canUseFileTransfer(staff)).toBe(true);
  });

  it('추가 권한을 들면 열린다 — 역할 문자열만 넘기면 안 보인다', () => {
    expect(canRegisterComplaints(staffPlus)).toBe(true);
    expect(canManageGiftRequests(staffPlus)).toBe(true);
    expect(canViewAllGiftRequests(staffPlus)).toBe(true);
    expect(canRegisterComplaints('staff')).toBe(false);
  });

  it('권한 하나만 켜면 그것만 열린다', () => {
    const only = { role: 'staff', perms: ['gift_manage'] };
    expect(canManageGiftRequests(only)).toBe(true);
    expect(canRegisterComplaints(only)).toBe(false);
  });

  it('추가 권한은 그 화면만 더 연다 — 관리자가 되는 게 아니다', () => {
    expect(canManageUsers(staffPlus)).toBe(false);
    expect(canViewAllComplaints(staffPlus)).toBe(false);
    expect(isAdminRole(staffPlus)).toBe(false);
  });

  it('켜 준 화면만 열린다', () => {
    expect(getAllowedDashboardRoutes(staffPlus)).toEqual([
      '/dashboard/complaint-register',
      '/dashboard/gift-manage',
    ]);
    expect(getAllowedDashboardRoutes({ role: 'staff', perms: ['file_transfer'] })).toEqual([
      '/dashboard/file-transfer',
    ]);
  });

  it('첫 화면은 켜 준 것 중 첫째다', () => {
    expect(getLandingRoute(staffPlus)).toBe('/dashboard/complaint-register');
    expect(getLandingRoute({ role: 'staff', perms: ['gift_manage'] })).toBe('/dashboard/gift-manage');
  });

  /*
   * 하나도 안 켜 주면 갈 데가 없다. 빈 목록을 내면 미들웨어가 첫 화면으로
   * 되돌리는데 그 첫 화면도 막혀 무한히 돈다.
   */
  it('아무것도 안 켜 준 담당자도 갈 데는 있다', () => {
    const empty = { role: 'staff', perms: [] as string[] };
    expect(getAllowedDashboardRoutes(empty)).toEqual(['/dashboard/file-transfer']);
    expect(getLandingRoute(empty)).toBe('/dashboard/file-transfer');
  });

  /*
   * 합치기 전 역할로 로그인해 둔 사람의 토큰. DB는 옮겼어도 그 토큰이
   * 만료될 때까지는 하던 일을 계속할 수 있어야 한다.
   */
  it('옛 역할 토큰은 그때의 권한으로 읽는다', () => {
    expect(canRegisterComplaints({ role: 'complaint' })).toBe(true);
    expect(getAllowedDashboardRoutes({ role: 'complaint' })).toEqual(['/dashboard/complaint-register']);
    expect(canManageGiftRequests({ role: 'gift' })).toBe(true);
    expect(getAllowedDashboardRoutes({ role: 'gift' })).toEqual(['/dashboard/gift-manage']);
    expect(canUseFileTransfer({ role: 'staff' })).toBe(true);
    expect(getAllowedDashboardRoutes({ role: 'staff' })).toEqual(['/dashboard/file-transfer']);
  });

  it('한 사람이 셋을 겸할 수 있다', () => {
    const all = { role: 'staff', perms: ['file_transfer', 'complaint_register', 'gift_manage'] };
    expect(canUseFileTransfer(all)).toBe(true);
    expect(canRegisterComplaints(all)).toBe(true);
    expect(canManageGiftRequests(all)).toBe(true);
    expect(getAllowedDashboardRoutes(all)).toHaveLength(3);
  });

  it('담당자를 새로 만들 때 고를 수 있는 역할에 옛 역할은 없다', () => {
    expect(isAssignableRole('staff')).toBe(true);
    expect(isAssignableRole('complaint')).toBe(false);
    expect(isAssignableRole('gift')).toBe(false);
  });

  it('모르는 값은 권한이 아니다', () => {
    expect(isExtraPermission('complaint_register')).toBe(true);
    expect(isExtraPermission('admin')).toBe(false);
    expect(isExtraPermission('')).toBe(false);
    expect(canRegisterComplaints({ role: 'staff', perms: ['admin'] })).toBe(false);
  });

  it('옛 토큰(perms 없음)도 역할대로 동작한다', () => {
    expect(canRegisterComplaints({ role: 'complaint' })).toBe(true);
    expect(canRegisterComplaints({ role: 'staff' })).toBe(false);
  });
});
