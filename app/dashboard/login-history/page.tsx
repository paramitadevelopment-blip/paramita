'use client';

import LoginHistorySection from './containers/LoginHistorySection';
import styles from './page.module.css';

function LoginHistoryPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>로그인 기록</h1>
      </div>

      <div className={styles.contentWrapper}>
        <LoginHistorySection />
      </div>
    </div>
  );
}

export default LoginHistoryPage;
