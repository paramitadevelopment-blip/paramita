'use client';

import { memo } from 'react';
import { MdInsertDriveFile, MdClose } from 'react-icons/md';
// 파일 업로드 화면과 같은 카드·버튼 모양을 쓴다. "분류"가 아니라 "전달"이라
// 흐름이 달라 컴포넌트는 따로 두지만, 스타일은 같은 모듈을 그대로 재사용한다.
import styles from '../../files/page.module.css';

interface SelectedFilesListProps {
  files: File[];
  isTransferring: boolean;
  onRemove: (index: number) => void;
  onRemoveAll: () => void;
  onTransfer: () => void;
}

const SelectedFilesList = memo(function SelectedFilesListComponent({
  files,
  isTransferring,
  onRemove,
  onRemoveAll,
  onTransfer,
}: SelectedFilesListProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <>
      <div className={styles.uploadedFilesSection}>
        <div className={styles.sectionHeader}>
          <h3>선택된 파일</h3>
          <div className={styles.sectionHeaderRight}>
            <button className={styles.clearAllBtn} onClick={onRemoveAll} disabled={isTransferring}>
              전체 삭제
            </button>
            <span className={styles.fileCount}>{files.length}</span>
          </div>
        </div>
        {files.map((file, index) => (
          <div key={`${file.name}-${index}`} className={styles.uploadedFileItem}>
            <div className={styles.fileIcon}>
              <MdInsertDriveFile />
            </div>
            <div className={styles.fileItemContent}>
              <div>
                <div className={styles.fileName}>{file.name}</div>
                <div className={styles.fileInfo}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
            </div>
            <button
              className={styles.deleteBtn}
              onClick={() => onRemove(index)}
              title="삭제"
              disabled={isTransferring}
            >
              <MdClose />
            </button>
          </div>
        ))}
      </div>

      <button className={styles.distributeBtn} onClick={onTransfer} disabled={isTransferring}>
        {isTransferring ? '전달 중...' : '전달'}
      </button>
    </>
  );
});

export default SelectedFilesList;
