'use client';

import DownloadHistorySection from './containers/DownloadHistorySection';
import styles from './page.module.css';

function DownloadHistoryPage() {
  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>다운로드 로그</h1>
        </div>

        <div className={styles.contentWrapper}>
          <DownloadHistorySection />
        </div>
      </div>
    </>
  );
}

export default DownloadHistoryPage;
