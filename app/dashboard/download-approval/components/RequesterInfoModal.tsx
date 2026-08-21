'use client';

import type { RequestRecord } from '../types';
import styles from '../page.module.css';

interface RequesterInfoModalProps {
  record: RequestRecord | null;
  onClose: () => void;
}

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString('ko-KR').slice(0, -1)} ${date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
};

export default function RequesterInfoModal({ record, onClose }: RequesterInfoModalProps) {
  if (!record) return null;

  return (
    <div className={styles.userModalOverlay}>
      <div className={styles.userModalContent}>
        <div className={styles.userModalHeader}>
          <h2 className={styles.userModalTitle}>요청자 정보</h2>
          <button className={styles.userModalCloseX} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.userModalBody}>
          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>아이디</label>
            <div className={styles.userModalValue}>{record.user_username || '-'}</div>
          </div>

          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>이름</label>
            <div className={styles.userModalValue}>{record.user_name || '-'}</div>
          </div>

          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>사번</label>
            <div className={styles.userModalValue}>{record.user_employee_id || '-'}</div>
          </div>

          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>소속</label>
            <div className={styles.userModalValue}>{record.user_department || '-'}</div>
          </div>

          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>파일명</label>
            <div className={styles.userModalValue}>{record.file_name}</div>
          </div>

          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>요청 시간</label>
            <div className={styles.userModalValue}>{formatDateTime(record.requested_at)}</div>
          </div>

          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>이 파일 거부 횟수</label>
            <div className={styles.userModalValue}>{record.file_reject_count}회</div>
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
