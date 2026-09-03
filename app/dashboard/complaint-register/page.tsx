'use client';

import ComplaintRegisterSection from './containers/ComplaintRegisterSection';
import styles from './page.module.css';

function ComplaintRegisterPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>민원 등록</h1>
      </div>

      <div className={styles.contentWrapper}>
        <ComplaintRegisterSection />
      </div>
    </div>
  );
}

export default ComplaintRegisterPage;
