'use client';

import GiftManageSection from './containers/GiftManageSection';
import styles from './page.module.css';

function GiftManagePage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>사은품 관리</h1>
      </div>

      <div className={styles.contentWrapper}>
        <GiftManageSection />
      </div>
    </div>
  );
}

export default GiftManagePage;
