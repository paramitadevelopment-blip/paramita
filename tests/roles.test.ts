import { describe, it, expect } from 'vitest';
import {
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
  getLandingRoute,
  getAllowedDashboardRoutes,
} from '@/lib/roles';

/**
 * 권한표.
 *
 * 라우트마다 흩어져 있던 역할 조건을 lib/roles.ts로 모았으므로, 이 표가 곧
 * 시스템의 권한 정의다. 역할을 하나 추가하면 아래 ROLES에 넣는 순간 모든
 * 항목에서 "이 역할은 되는가"를 정해야 테스트가 통과한다 — 빠뜨리고 넘어갈
 * 수가 없다. 그게 이 표의 목적이다.
 */
const ROLES: Role[] = ['admin', 'subadmin', 'staff', 'user'];

const MATRIX: Array<{ name: string; fn: (r?: string | null) => boolean; allowed: Role[] }> = [
  // 역할 자체를 묻는 것
  { name: 'isAdminRole', fn: isAdminRole, allowed: ['admin', 'subadmin'] },
  { name: 'isStaffRole', fn: isStaffRole, allowed: ['staff'] },
  { name: 'isProtectedAccount', fn: isProtectedAccount, allowed: ['admin'] },
  { name: 'hasFixedDepartment', fn: hasFixedDepartment, allowed: ['subadmin', 'staff'] },
  { name: 'belongsToOrganization', fn: belongsToOrganization, allowed: ['user'] },

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

  it('모르는 역할은 가장 좁은 화면만 받는다', () => {
    expect(getAllowedDashboardRoutes('manager')).toEqual([
      '/dashboard/download',
      '/dashboard/reapply',
    ]);
  });
});
