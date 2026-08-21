'use client';

import RedownloadTimeline from '@/app/components/RedownloadTimeline/RedownloadTimeline';
import type { RequestRecord } from '../types';
import styles from '../page.module.css';

interface RequestReasonModalProps {
  record: RequestRecord | null;
  onClose: () => void;
}

export default function RequestReasonModal({ record, onClose }: RequestReasonModalProps) {
  if (!record) return null;

  return (
    <div className={styles.userModalOverlay}>
      <div className={styles.userModalContent}>
        <div className={styles.userModalHeader}>
          <h2 className={styles.userModalTitle}>요청 사유 · 이력</h2>
          <button className={styles.userModalCloseX} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.userModalBody}>
          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>요청자</label>
            <div className={styles.userModalValue}>
              {record.user_username || '-'} ({record.user_name || '-'})
            </div>
          </div>

          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>파일명</label>
            <div className={styles.userModalValue}>{record.file_name}</div>
          </div>

          {/* 이번 건만 보면 판단이 안 된다. 지난 요청 사유와 내가 거부했던 사유까지 같이 본다. */}
          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>
              요청 이력 (거부 {record.file_reject_count}회)
            </label>
            <RedownloadTimeline
              fileId={record.file_id}
              userId={record.user_id}
              username={record.user_username}
            />
          </div>
        </div>

        <div className={styles.userModalFooter}>
          <button className={styles.userModalCloseBtn} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
