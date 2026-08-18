'use client';

import React, { memo } from 'react';
import { DeletedFile } from '@/app/hooks/useDeletionHistory';
import styles from './DeletedFileGroup.module.css';

interface DeletedFileGroupProps {
  label: string;
  variant: 'original' | 'distributed';
  files: DeletedFile[];
  onFileClick: (file: DeletedFile) => void;
}

const DeletedFileGroup = memo(function DeletedFileGroupComponent({
  label,
  variant,
  files,
  onFileClick,
}: DeletedFileGroupProps) {
  const badgeClass = variant === 'original' ? styles.badgeOriginal : styles.badgeDistributed;

  return (
    <div className={styles.group}>
      <div className={styles.groupHeader}>
        <span className={badgeClass}>{label}</span>
        <span className={styles.count}>{files.length}건</span>
      </div>

      {files.length === 0 ? (
        <div className={styles.empty}>없음</div>
      ) : (
        <ul className={styles.list}>
          {files.map((file) => (
            <li key={file.id} className={styles.item}>
              <button
                type="button"
                className={styles.fileName}
                onClick={() => onFileClick(file)}
                title="미리보기"
              >
                {file.name}
              </button>
              {file.restored_at && <span className={styles.restoredTag}>복구됨</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default DeletedFileGroup;
