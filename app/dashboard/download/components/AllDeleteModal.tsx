'use client';

import { memo } from 'react';
import styles from '../page.module.css';

interface AllDeleteModalProps {
  isOpen: boolean;
  totalFiles: number;
  showOriginal: boolean;
  verificationCode: string;
  verificationInput: string;
  withDistributed: boolean;
  reason: string;
  onClose: () => void;
  onVerificationChange: (value: string) => void;
  onWithDistributedChange: (checked: boolean) => void;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
}

const AllDeleteModal = memo(function AllDeleteModal({
  isOpen,
  totalFiles,
  showOriginal,
  verificationCode,
  verificationInput,
  withDistributed,
  reason,
  onClose,
  onVerificationChange,
  onWithDistributedChange,
  onReasonChange,
  onConfirm,
}: AllDeleteModalProps) {
  if (!isOpen) return null;

  const canDelete = reason.trim().length > 0;

  return (
    // 배경 클릭으로는 닫지 않는다. 취소 버튼으로만 닫는다.
    <div className={styles.userModalOverlay}>
      <div className={styles.userModalContent}>
        <h2 className={styles.userModalTitle}>모든 파일 삭제</h2>

        <div className={styles.userModalField}>
          <p style={{ fontSize: '16px', marginBottom: '12px' }}>
            전체 <span style={{ color: '#db1a62', fontWeight: 600 }}>{totalFiles}개</span>의 파일을 정말 삭제하시겠습니까?
          </p>
        </div>

        {showOriginal && (
          <div className={styles.userModalField} style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={withDistributed}
                onChange={(e) => onWithDistributedChange(e.target.checked)}
                style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '16px' }}>배포된 파일도 함께 삭제</span>
            </label>
          </div>
        )}

        <div className={styles.userModalField}>
          <label className={styles.userModalLabel}>
            삭제 사유 <span style={{ color: '#db1a62' }}>*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="삭제 사유를 입력해주세요"
            maxLength={500}
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '16px',
              boxSizing: 'border-box',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ textAlign: 'right', fontSize: '14px', color: '#999', marginTop: '4px', marginBottom: '8px' }}>
            {reason.length}/500
          </div>
        </div>

        <div className={styles.userModalField}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            확인 번호: <span style={{ fontWeight: 600, color: '#000', fontSize: '16px' }}>{verificationCode}</span>
          </p>
          <input
            type="text"
            placeholder="확인 번호를 입력해주세요"
            value={verificationInput}
            onChange={(e) => onVerificationChange(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '16px',
              boxSizing: 'border-box',
              marginBottom: '16px',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className={styles.userModalCloseBtn}
            onClick={onClose}
            style={{ background: '#e0e0e0', color: '#333' }}
          >
            취소
          </button>
          <button
            className={styles.userModalCloseBtn}
            onClick={onConfirm}
            disabled={!canDelete}
            style={{
              background: canDelete ? '#db1a62' : '#e0e0e0',
              color: canDelete ? 'white' : '#999',
              cursor: canDelete ? 'pointer' : 'not-allowed',
            }}
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
});

export default AllDeleteModal;
