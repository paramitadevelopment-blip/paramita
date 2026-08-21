'use client';

import styles from '../page.module.css';

interface RedownloadRequestModalProps {
  isOpen: boolean;
  fileName: string;
  reason: string;
  maxLength: number;
  isSubmitting: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export default function RedownloadRequestModal({
  isOpen,
  fileName,
  reason,
  maxLength,
  isSubmitting,
  onReasonChange,
  onClose,
  onConfirm,
}: RedownloadRequestModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalTitleBar}>
          <h2 className={styles.modalTitle}>재다운로드 요청</h2>
          <button className={styles.modalCloseX} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.requestModalBody}>
          <p className={styles.requestFileName}>
            <strong>파일명:</strong> {fileName}
          </p>
          <label className={styles.requestReasonLabel}>재다운로드 사유 (필수)</label>
          <textarea
            className={styles.requestReasonTextarea}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="재다운로드가 필요한 사유를 입력해주세요."
            maxLength={maxLength}
            required
          />
          <div className={styles.charCount}>
            {reason.length} / {maxLength}
          </div>
        </div>

        <div className={styles.requestModalActions}>
          <button className={styles.cancelBtn} onClick={onClose}>
            취소
          </button>
          <button className={styles.confirmBtn} onClick={onConfirm} disabled={isSubmitting}>
            요청
          </button>
        </div>
      </div>
    </div>
  );
}
