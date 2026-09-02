'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/app/store/authStore';
import { usePendingRequestCount } from '@/app/hooks/usePendingRequestCount';
import { useUnreadReapplyCount } from '@/app/hooks/useReapplyNotices';
import { MdDashboard, MdPeople, MdCloudUpload, MdFileDownload, MdInsertDriveFile, MdHistory, MdDeleteSweep, MdLogout, MdPerson, MdVerifiedUser, MdSearch, MdFactCheck, MdBlock, MdPersonSearch, MdLogin, MdDriveFolderUpload } from 'react-icons/md';
import {
  canManageUsers,
  canViewDashboard,
  canClassifyAndDeploy,
  canUseFileTransfer,
  canManageFiles,
  canDownloadDeployedFiles,
  canViewReapplyNotices,
  canReviewDownloadRequests,
  canUseGlobalSearch,
  canViewAccessLogs,
  canManageBlacklist,
} from '@/lib/roles';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  // 필요한 값만 구독한다. 스토어를 통째로 받으면 관련 없는 값이 바뀌어도
  // 다시 그려지는데, 사이드바는 모든 화면에 떠 있어 영향이 넓다.
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  // 메뉴는 역할 이름이 아니라 '무엇을 할 수 있는가'로 가른다 — 역할이 늘어도
  // lib/roles.ts만 보면 되고, 화면 접근을 실제로 막는 proxy.ts와 같은 기준을 쓴다.
  const role = user?.role;
  const { data: pendingCount = 0 } = usePendingRequestCount(canReviewDownloadRequests(role));
  // 재신청 알림은 지사도 본다. 로그인만 되어 있으면 자기 소속 건수를 센다.
  const { data: reapplyCount = 0 } = useUnreadReapplyCount(Boolean(user));

  // 쿠키 만료를 서버에 요청하므로 완료 후 이동한다.
  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <aside className={styles.sidebar}>
      <Link href="/dashboard" className={styles.logo}>
        <img
          src="/logo/logo.png"
          alt="logo"
          style={{ width: 'auto', height: '50px' }}
        />
      </Link>

      <nav className={styles.nav}>
        <ul>
          {canViewDashboard(role) && (
            <li>
              <Link
                href="/dashboard"
                className={`${styles.navLink} ${pathname === '/dashboard' ? styles.active : ''}`}
              >
                <MdDashboard className={styles.icon} />
                <span>대시보드</span>
              </Link>
            </li>
          )}
          {canManageUsers(role) && (
            <li>
              <Link
                href="/dashboard/users"
                className={`${styles.navLink} ${pathname === '/dashboard/users' ? styles.active : ''}`}
              >
                <MdPeople className={styles.icon} />
                <span>사용자 관리</span>
              </Link>
            </li>
          )}
          {canClassifyAndDeploy(role) && (
            <li>
              <Link
                href="/dashboard/files"
                className={`${styles.navLink} ${pathname === '/dashboard/files' ? styles.active : ''}`}
              >
                <MdCloudUpload className={styles.icon} />
                <span>파일 업로드</span>
              </Link>
            </li>
          )}
          {canUseFileTransfer(role) && (
            <li>
              <Link
                href="/dashboard/file-transfer"
                className={`${styles.navLink} ${pathname === '/dashboard/file-transfer' ? styles.active : ''}`}
              >
                <MdDriveFolderUpload className={styles.icon} />
                <span>파일전달</span>
              </Link>
            </li>
          )}
          {canManageFiles(role) && (
            <li>
              <Link
                href="/dashboard/original-files"
                className={`${styles.navLink} ${pathname === '/dashboard/original-files' ? styles.active : ''}`}
              >
                <MdInsertDriveFile className={styles.icon} />
                <span>원본파일 관리</span>
              </Link>
            </li>
          )}
          {canDownloadDeployedFiles(role) && (
            <li>
              <Link
                href="/dashboard/download"
                className={`${styles.navLink} ${pathname === '/dashboard/download' ? styles.active : ''}`}
              >
                <MdFileDownload className={styles.icon} />
                <span>파일 다운로드</span>
              </Link>
            </li>
          )}
          {canViewReapplyNotices(role) && (
            <li>
              <Link
                href="/dashboard/reapply"
                className={`${styles.navLink} ${pathname === '/dashboard/reapply' ? styles.active : ''}`}
              >
                <MdPersonSearch className={styles.icon} />
                <span>재신청 고객</span>
                {reapplyCount > 0 && (
                  <span className={styles.badge}>{reapplyCount > 99 ? '99+' : reapplyCount}</span>
                )}
              </Link>
            </li>
          )}
          {canReviewDownloadRequests(role) && (
            <li>
              <Link
                href="/dashboard/download-approval"
                className={`${styles.navLink} ${pathname === '/dashboard/download-approval' ? styles.active : ''}`}
              >
                <MdFactCheck className={styles.icon} />
                <span>파일 다운로드 승인</span>
                {pendingCount > 0 && (
                  <span className={styles.badge}>{pendingCount > 99 ? '99+' : pendingCount}</span>
                )}
              </Link>
            </li>
          )}
          {canUseGlobalSearch(role) && (
            <li>
              <Link
                href="/dashboard/search"
                className={`${styles.navLink} ${pathname === '/dashboard/search' ? styles.active : ''}`}
              >
                <MdSearch className={styles.icon} />
                <span>검색</span>
              </Link>
            </li>
          )}
          {canViewAccessLogs(role) && (
            <li>
              <Link
                href="/dashboard/download-history"
                className={`${styles.navLink} ${pathname === '/dashboard/download-history' ? styles.active : ''}`}
              >
                <MdHistory className={styles.icon} />
                <span>다운로드 로그</span>
              </Link>
            </li>
          )}
          {canViewAccessLogs(role) && (
            <li>
              <Link
                href="/dashboard/login-history"
                className={`${styles.navLink} ${pathname === '/dashboard/login-history' ? styles.active : ''}`}
              >
                <MdLogin className={styles.icon} />
                <span>로그인 기록</span>
              </Link>
            </li>
          )}
          {canManageBlacklist(role) && (
            <li>
              <Link
                href="/dashboard/blacklist"
                className={`${styles.navLink} ${pathname === '/dashboard/blacklist' ? styles.active : ''}`}
              >
                <MdBlock className={styles.icon} />
                <span>블랙리스트</span>
              </Link>
            </li>
          )}
          {canManageFiles(role) && (
            <li>
              <Link
                href="/dashboard/files/history"
                className={`${styles.navLink} ${pathname === '/dashboard/files/history' ? styles.active : ''}`}
              >
                <MdDeleteSweep className={styles.icon} />
                <span>파일 삭제 히스토리</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>

      <div className={styles.footer}>
        {user && (
          <div className={styles.userInfo}>
            <p className={styles.userId}>
              <MdPerson className={styles.icon} />
              {user.username}
            </p>
            <p className={styles.userRole}>
              <MdVerifiedUser className={styles.icon} />
              {user.name}님
            </p>
          </div>
        )}
        <button className={styles.logoutBtn} onClick={handleLogout}>
          <MdLogout className={styles.icon} />
          <span>로그아웃</span>
        </button>
      </div>
    </aside>
  );
}
