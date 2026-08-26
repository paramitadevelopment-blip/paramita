'use client';

import ReapplySection from './containers/ReapplySection';
import styles from './page.module.css';

function ReapplyPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>재신청 고객</h1>
      </div>

      <div className={styles.contentWrapper}>
        <ReapplySection />
      </div>
    </div>
  );
}

export default ReapplyPage;
