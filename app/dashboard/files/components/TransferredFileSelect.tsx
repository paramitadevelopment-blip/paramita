'use client';

import { useState, useCallback, memo } from 'react';
import {
  MdInsertDriveFile,
  MdPerson,
  MdAccessTime,
  MdCheckCircle,
  MdOutlineCheckBoxOutlineBlank,
  MdVisibility,
} from 'react-icons/md';
import { useMyUploads, type MyUpload } from '@/app/hooks/useMyUploads';
import { usePreviewMyUpload } from '@/app/hooks/useFileTransferActions';
import { useAlert } from '@/app/components/Alert/Alert';
import Spinner from '@/app/components/Spinner/Spinner';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import ExcelPreviewModal from '../../download/components/ExcelPreviewModal';
import styles from '../page.module.css';

interface TransferredFileSelectProps {
  onFileSelect: (files: File[]) => void;
  /** 체크 해제로 뺄 때, 그 체크로 가져왔던 File을 그대로 돌려준다. */
  onFileRemove: (file: File) => void;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch {
    return dateString;
  }
}

const TransferredFileSelect = memo(function TransferredFileSelectComponent({
  onFileSelect,
  onFileRemove,
  disabled = false,
}: TransferredFileSelectProps) {
  const { showAlert } = useAlert();
  const { data, isLoading, error } = useMyUploads(1, 5);
  const previewMutation = usePreviewMyUpload();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 체크 해제됐을 때 어느 File을 빼야 하는지 알아야 한다. upload.id → 그때 가져온 File.
  const [importedFiles, setImportedFiles] = useState<Map<string, File>>(new Map());
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const uploads = data?.data ?? [];

  // 미리보기 열기
  const handlePreview = useCallback(
    (fileId: string, fileName: string) => {
      previewMutation.mutate(
        { fileId, fileName },
        {
          onSuccess: (file) => setPreviewFile(file),
          onError: () => {
            showAlert({ type: 'error', title: '오류', message: '파일을 열 수 없습니다.' });
          },
        }
      );
    },
    [previewMutation, showAlert]
  );

  const closePreview = useCallback(() => {
    setPreviewFile(null);
  }, []);

  // 단일 파일 다운로드 및 File 변환
  const downloadSingleFile = async (fileInfo: MyUpload): Promise<File> => {
    const response = await fetch(`/api/file-transfer/${fileInfo.id}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`'${fileInfo.name}' 파일을 가져올 수 없습니다.`);
    }

    const blob = await response.blob();
    return new File([blob], fileInfo.name, {
      type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  };

  // 체크하면 바로 가져와 선택 목록에 더한다. 체크하고 나서 또 다른 버튼을
  // 눌러야 분류 버튼이 나오면 뎁스가 한 단 더 생긴다.
  const importFile = useCallback(
    async (fileInfo: MyUpload) => {
      setIsLoadingFile(true);
      try {
        const file = await downloadSingleFile(fileInfo);
        onFileSelect([file]);
        setImportedFiles((prev) => new Map(prev).set(fileInfo.id, file));
        setSelectedIds((prev) => (prev.includes(fileInfo.id) ? prev : [...prev, fileInfo.id]));
        // 체크할 때마다 뜨는 확인 모달은 없앤다 — 체크 표시·아래 선택된 파일
        // 목록에 바로 나타나므로 그것으로 충분하다. 여러 개 연달아 체크하면
        // 모달을 그만큼 눌러 닫아야 해서 오히려 방해가 된다.
      } catch (err) {
        console.error('Failed to load file:', err);
        showAlert({
          type: 'error',
          title: '오류',
          message: err instanceof Error ? err.message : '파일을 불러오는 중 문제가 발생했습니다.',
        });
      } finally {
        setIsLoadingFile(false);
      }
    },
    [onFileSelect, showAlert]
  );

  // 체크 해제하면 그 체크로 가져왔던 File을 정확히 짚어 선택 목록에서도 뺀다.
  // 표시만 지우고 실제로는 안 빠지면, 체크가 풀린 걸 보고도 여전히 배포 대상에
  // 남아 있는 상태가 된다.
  const handleToggleSelect = useCallback(
    (fileInfo: MyUpload) => {
      if (disabled || isLoadingFile) return;
      if (selectedIds.includes(fileInfo.id)) {
        const file = importedFiles.get(fileInfo.id);
        if (file) onFileRemove(file);
        setImportedFiles((prev) => {
          const next = new Map(prev);
          next.delete(fileInfo.id);
          return next;
        });
        setSelectedIds((prev) => prev.filter((id) => id !== fileInfo.id));
        return;
      }
      importFile(fileInfo);
    },
    [disabled, isLoadingFile, selectedIds, importedFiles, onFileRemove, importFile]
  );

  if (isLoading) {
    return (
      <div className={styles.transferLoadingBox}>
        <div className={styles.spinner} />
        <p>전달된 파일 목록을 불러오는 중입니다...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.transferErrorBox}>
        <p>전달된 파일 목록을 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <div className={styles.transferEmptyContainer}>
        <EmptyState message="파일 전달 대기열에 등록된 파일이 없습니다." />
      </div>
    );
  }

  return (
    <div className={styles.transferSelectContainer}>
      <Spinner isLoading={isLoadingFile || previewMutation.isPending} />

      <div className={styles.transferToolbar}>
        <div className={styles.transferToolbarLeft}>
          <span className={styles.transferToolbarTitle}>최근 전달된 파일 목록</span>
          {selectedIds.length > 0 && (
            <span className={styles.transferSelectedBadge}>
              {selectedIds.length}개 가져옴
            </span>
          )}
        </div>
      </div>

      <div className={styles.transferCardList}>
        {uploads.map((file) => {
          const isChecked = selectedIds.includes(file.id);
          return (
            <div
              key={file.id}
              className={`${styles.transferCardItem} ${isChecked ? styles.transferCardItemChecked : ''}`}
              onClick={() => handleToggleSelect(file)}
            >
              <div
                className={styles.transferCardCheckbox}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSelect(file);
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggleSelect(file)}
                  disabled={disabled || isLoadingFile}
                  className={styles.transferHiddenCheckbox}
                />
                {isChecked ? (
                  <MdCheckCircle className={styles.cardCheckIconActive} />
                ) : (
                  <MdOutlineCheckBoxOutlineBlank className={styles.cardCheckIcon} />
                )}
              </div>

              <div className={styles.transferCardIcon}>
                <MdInsertDriveFile />
              </div>

              <div className={styles.transferCardContent}>
                <div className={styles.transferFileNameRow}>
                  <button
                    type="button"
                    className={styles.transferPreviewBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(file.id, file.name);
                    }}
                    title="클릭하여 엑셀 내용 미리보기"
                  >
                    <span className={styles.transferCardFileName}>{file.name}</span>
                    <span className={styles.transferPreviewBadge}>
                      <MdVisibility /> 미리보기
                    </span>
                  </button>
                </div>
                <div className={styles.transferCardMeta}>
                  <span className={styles.transferMetaItem}>
                    <MdPerson />
                    <strong>올린 사람:</strong> {file.uploaded_by_name || '미지정'}
                  </span>
                  <span className={styles.transferMetaItem}>
                    <MdAccessTime />
                    <strong>전달 시각:</strong> {formatDate(file.uploaded_at)}
                  </span>
                  <span className={styles.transferMetaSize}>{formatFileSize(file.size)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {previewFile && <ExcelPreviewModal file={previewFile} onClose={closePreview} />}
    </div>
  );
});

export default TransferredFileSelect;
