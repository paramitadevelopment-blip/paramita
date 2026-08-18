'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/app/store/authStore';
import { MdDashboard, MdPeople, MdCloudUpload, MdFileDownload, MdInsertDriveFile, MdHistory, MdDeleteSweep, MdLogout, MdPerson, MdVerifiedUser, MdSearch } from 'react-icons/md';
import styles from './Sidebar.module.css';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

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
          {user?.role === 'admin' && (
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
          {user?.role === 'admin' && (
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
          {user?.role === 'admin' && (
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
          {user?.role === 'admin' && (
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
          <li>
            <Link
              href="/dashboard/download"
              className={`${styles.navLink} ${pathname === '/dashboard/download' ? styles.active : ''}`}
            >
              <MdFileDownload className={styles.icon} />
              <span>파일 다운로드</span>
            </Link>
          </li>
          {user?.role === 'admin' && (
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
          {user?.role === 'admin' && (
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
          {user?.role === 'admin' && (
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
