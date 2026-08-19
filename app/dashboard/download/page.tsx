'use client';

import FilesSection from './containers/FilesSection';
import styles from './page.module.css';

export default function DownloadPage() {
  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>파일 다운로드</h1>
        </div>

        <div className={styles.contentWrapper}>
          <FilesSection showDepartmentFilter={true} />
        </div>
      </div>
    </>
  );
}
