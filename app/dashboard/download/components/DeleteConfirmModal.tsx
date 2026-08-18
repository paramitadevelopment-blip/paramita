'use client';

import { memo } from 'react';
import styles from '../page.module.css';

interface DistributedFile {
  id: string;
  name: string;
  department: string;
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  fileNames: string[];
  hasOriginal: boolean;
  distributedFiles: DistributedFile[];
  isLoadingDistributed: boolean;
  selectedDistributedFileIds: Set<string>;
  reason: string;
  onClose: () => void;
  onSelectAllDistributed: () => void;
  onDeselectAllDistributed: () => void;
  onToggleDistributedFile: (fileId: string, checked: boolean) => void;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
}

const DeleteConfirmModal = memo(function DeleteConfirmModal({
  isOpen,
  fileNames,
  hasOriginal,
  distributedFiles,
  isLoadingDistributed,
  selectedDistributedFileIds,
  reason,
  onClose,
  onSelectAllDistributed,
  onDeselectAllDistributed,
  onToggleDistributedFile,
  onReasonChange,
  onConfirm,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  const canDelete = reason.trim().length > 0;

  return (
    // 배경 클릭으로는 닫지 않는다. 취소 버튼으로만 닫는다.
    <div className={styles.userModalOverlay}>
      <div className={styles.userModalContent} style={{ maxHeight: 'auto', minWidth: '500px' }}>
        <div style={{ flex: '0 0 auto' }}>
          <h2 className={styles.userModalTitle}>파일 삭제</h2>

          <div className={styles.userModalField}>
            <label className={styles.userModalLabel}>삭제할 파일</label>
            <div className={styles.userModalValue} style={{ maxHeight: '350px', overflowY: 'auto' }}>
              {fileNames.map((name, i) => (
                <div key={i} style={{ marginBottom: '4px' }}>
                  • {name}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ flex: '1', overflowY: 'auto', paddingRight: '8px' }}>
          {hasOriginal && isLoadingDistributed && (
            <div className={styles.userModalField} style={{ color: '#666', fontSize: '16px' }}>
              배포된 파일을 불러오는 중...
            </div>
          )}

          {hasOriginal && !isLoadingDistributed && distributedFiles.length === 0 && (
            <div className={styles.userModalField} style={{ color: '#999', fontSize: '16px' }}>
              이 원본에 연결된 배포 파일이 없습니다.
            </div>
          )}

          {hasOriginal && distributedFiles.length > 0 && (
            <div className={styles.userModalField} style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <label className={styles.userModalLabel} style={{ margin: 0, fontSize: '18px' }}>
                  배포된 파일 (소속별)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={onSelectAllDistributed}
                    style={{
                      padding: '8px 16px',
                      fontSize: '16px',
                      background: '#db1a62',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    전체 선택
                  </button>
                  <button
                    onClick={onDeselectAllDistributed}
                    style={{
                      padding: '8px 16px',
                      fontSize: '16px',
                      background: '#e0e0e0',
                      color: '#333',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    전체 해제
                  </button>
                </div>
              </div>
              <div style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '12px', maxHeight: '350px', overflowY: 'auto' }}>
                {distributedFiles.map((file) => (
                  <label key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
                    <input
                      type="checkbox"
                      checked={selectedDistributedFileIds.has(file.id)}
                      onChange={(e) => onToggleDistributedFile(file.id, e.target.checked)}
                      style={{ width: '24px', height: '24px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '16px' }}>
                      {file.name} <span style={{ color: '#999', fontSize: '14px' }}>({file.department})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.userModalField} style={{ flex: '0 0 auto', marginTop: '8px', marginBottom: 0 }}>
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
          <div style={{ textAlign: 'right', fontSize: '14px', color: '#999', marginTop: '4px' }}>
            {reason.length}/500
          </div>
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e0e0e0' }}>
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

export default DeleteConfirmModal;
