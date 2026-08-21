'use client';

import DownloadApprovalSection from './containers/DownloadApprovalSection';
import styles from './page.module.css';

function DownloadApprovalPage() {
  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>파일 다운로드 승인</h1>
        </div>

        <div className={styles.contentWrapper}>
          <DownloadApprovalSection />
        </div>
      </div>
    </>
  );
}

export default DownloadApprovalPage;
