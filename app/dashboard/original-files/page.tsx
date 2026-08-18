'use client';

import FilesSection from '../download/containers/FilesSection';
import styles from '../download/page.module.css';

function OriginalFilesPage() {
  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>원본파일 관리</h1>
        </div>

        <div className={styles.contentWrapper}>
          <FilesSection showDepartmentFilter={false} showOriginal={true} />
        </div>
      </div>
    </>
  );
}

export default OriginalFilesPage;
