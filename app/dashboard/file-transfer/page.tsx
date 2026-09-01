'use client';

import FileTransferSection from './containers/FileTransferSection';
import styles from '../files/page.module.css';

/**
 * DB담당자 전용 화면.
 *
 * 원본을 저장소에 올리기만 한다. 분류·배포는 여기 없다 — 그건 관리자가
 * 파일 업로드 화면에서 한다.
 */
function FileTransferPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>파일전달</h1>
      </div>

      <div className={styles.contentWrapper}>
        <FileTransferSection />
      </div>
    </div>
  );
}

export default FileTransferPage;
