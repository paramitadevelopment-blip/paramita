'use client';

import { memo } from 'react';
import { MdInsertDriveFile, MdClose } from 'react-icons/md';
import styles from '../page.module.css';

interface SelectedFilesListProps {
  files: File[];
  isDistributing: boolean;
  onRemove: (index: number) => void;
  onRemoveAll: () => void;
  onDistribute: () => void;
}

const SelectedFilesList = memo(function SelectedFilesListComponent({
  files,
  isDistributing,
  onRemove,
  onRemoveAll,
  onDistribute,
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
            <button className={styles.clearAllBtn} onClick={onRemoveAll}>
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
            >
              <MdClose />
            </button>
          </div>
        ))}
      </div>

      <button
        className={styles.distributeBtn}
        onClick={onDistribute}
        disabled={isDistributing}
      >
        {isDistributing ? '분류 중...' : '분류'}
      </button>
    </>
  );
});

export default SelectedFilesList;
