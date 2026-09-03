'use client';

import ComplaintSection from './containers/ComplaintSection';
import styles from './page.module.css';

function ComplaintsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>민원</h1>
      </div>

      <div className={styles.contentWrapper}>
        <ComplaintSection />
      </div>
    </div>
  );
}

export default ComplaintsPage;
