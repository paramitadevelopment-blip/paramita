'use client';

import GiftRequestSection from './containers/GiftRequestSection';
import styles from './page.module.css';

function GiftRequestsPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>사은품 신청</h1>
      </div>

      <div className={styles.contentWrapper}>
        <GiftRequestSection />
      </div>
    </div>
  );
}

export default GiftRequestsPage;
