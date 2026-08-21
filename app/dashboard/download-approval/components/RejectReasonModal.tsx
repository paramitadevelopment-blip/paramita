'use client';

import styles from '../page.module.css';

interface RejectReasonModalProps {
  isOpen: boolean;
  reason: string;
  maxLength: number;
  isSubmitting: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export default function RejectReasonModal({
  isOpen,
  reason,
  maxLength,
  isSubmitting,
  onReasonChange,
  onClose,
  onConfirm,
}: RejectReasonModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.userModalOverlay}>
      <div className={styles.userModalContent}>
        <div className={styles.userModalHeader}>
          <h2 className={styles.userModalTitle}>요청 거부</h2>
          <button className={styles.userModalCloseX} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.userModalBody}>
          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>거부 사유 (필수)</label>
            <textarea
              className={styles.rejectTextarea}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="거부 사유를 입력해주세요. 요청자에게 그대로 표시됩니다."
              maxLength={maxLength}
              required
            />
            <div className={styles.charCount}>
              {reason.length} / {maxLength}
            </div>
          </div>
        </div>

        <div className={`${styles.userModalFooter} ${styles.rejectModalActions}`}>
          <button className={styles.rejectCancelBtn} onClick={onClose}>
            취소
          </button>
          <button className={styles.rejectConfirmBtn} onClick={onConfirm} disabled={isSubmitting}>
            거부
          </button>
        </div>
      </div>
    </div>
  );
}
