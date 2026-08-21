'use client';

import RedownloadTimeline from '@/app/components/RedownloadTimeline/RedownloadTimeline';
import styles from '../page.module.css';

interface RedownloadHistoryModalProps {
  file: { id: string; name: string } | null;
  onClose: () => void;
}

export default function RedownloadHistoryModal({ file, onClose }: RedownloadHistoryModalProps) {
  if (!file) return null;

  return (
    <div className={styles.modal}>
      <div className={styles.historyModalContent}>
        <div className={styles.historyModalHeader}>
          <h2 className={styles.modalTitle}>재다운로드 요청 이력</h2>
          <button className={styles.modalCloseX} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.historyModalBody}>
          <p className={styles.historyFileName}>{file.name}</p>
          <RedownloadTimeline fileId={file.id} />
        </div>

        <div className={styles.historyModalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
