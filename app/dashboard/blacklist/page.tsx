'use client';

import { useState } from 'react';
import BlacklistSection from './containers/BlacklistSection';
import styles from './page.module.css';

function BlacklistPage() {
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>블랙리스트</h1>
          <button className={styles.registerBtn} onClick={() => setShowRegisterModal(true)}>
            직접 등록
          </button>
        </div>

        <div className={styles.contentWrapper}>
          <BlacklistSection showRegisterModal={showRegisterModal} setShowRegisterModal={setShowRegisterModal} />
        </div>
      </div>
    </>
  );
}

export default BlacklistPage;
