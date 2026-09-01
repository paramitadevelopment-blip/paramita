'use client';

// 삭제 사유 입력창은 원본파일 관리의 재다운로드 요청 모달과 같은 모양을 쓴다.
// 삭제 기록이 같은 삭제 히스토리 화면에 남으므로 입력 방식도 맞춘다.
import styles from '../../download/page.module.css';

interface DeleteReasonModalProps {
  isOpen: boolean;
  fileName: string;
  reason: string;
  maxLength: number;
  isSubmitting: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteReasonModal({
  isOpen,
  fileName,
  reason,
  maxLength,
  isSubmitting,
  onReasonChange,
  onClose,
  onConfirm,
}: DeleteReasonModalProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalTitleBar}>
          <h2 className={styles.modalTitle}>파일 삭제</h2>
          <button className={styles.modalCloseX} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.requestModalBody}>
          <p className={styles.requestFileName}>
            <strong>파일명:</strong> {fileName}
          </p>
          <label className={styles.requestReasonLabel}>삭제 사유 (필수)</label>
          <textarea
            className={styles.requestReasonTextarea}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="삭제하는 사유를 입력해주세요."
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
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
