'use client';

import { MdLogout } from 'react-icons/md';
import Spinner from '@/app/components/Spinner/Spinner';
import { getCsrfToken } from '@/app/store/authStore';
import { useHistoryAccess } from '@/app/hooks/useHistoryAccess';
import DeletionHistorySection from './containers/DeletionHistorySection';
import PasswordGate from './components/PasswordGate';
import styles from './page.module.css';

function FileHistoryPage() {
  const { data, isLoading, refetch } = useHistoryAccess();

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/files/history/verify', {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
        credentials: 'include',
      });

      if (response.ok) {
        refetch();
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>파일 삭제 히스토리</h1>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <MdLogout className={styles.logoutIcon} />
            <span>히스토리 로그아웃</span>
          </button>
        </div>

        <div className={styles.contentWrapper}>
          {isLoading ? (
            <Spinner isLoading />
          ) : data?.hasAccess ? (
            <DeletionHistorySection />
          ) : (
            <PasswordGate />
          )}
        </div>
      </div>
    </>
  );
}

export default FileHistoryPage;
