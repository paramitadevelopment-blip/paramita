'use client';

import { useState, useCallback, memo } from 'react';
import {
  MdInsertDriveFile,
  MdPerson,
  MdAccessTime,
  MdArrowForward,
  MdCheckCircle,
  MdOutlineCheckBoxOutlineBlank,
  MdDownload,
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
  disabled = false,
}: TransferredFileSelectProps) {
  const { showAlert } = useAlert();
  const { data, isLoading, error } = useMyUploads(1, 5);
  const previewMutation = usePreviewMyUpload();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const uploads = data?.data ?? [];

  // 개별 체크박스 토글
  const handleToggleSelect = useCallback((fileId: string) => {
    setSelectedIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  }, []);

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

  // 선택된 여러 파일 일괄 가져오기
  const handleFetchSelected = useCallback(async () => {
    if (selectedIds.length === 0) {
      showAlert({ type: 'warning', title: '알림', message: '가져올 파일을 체크해주세요.' });
      return;
    }

    const targetFiles = uploads.filter((f) => selectedIds.includes(f.id));
    if (targetFiles.length === 0) return;

    setIsLoadingFile(true);
    try {
      const fetchedFiles = await Promise.all(targetFiles.map((f) => downloadSingleFile(f)));
      onFileSelect(fetchedFiles);
      setSelectedIds([]);
      showAlert({
        type: 'success',
        title: '완료',
        message: `${fetchedFiles.length}개의 파일을 가져왔습니다.`,
      });
    } catch (err) {
      console.error('Failed to load selected files:', err);
      showAlert({
        type: 'error',
        title: '오류',
        message: err instanceof Error ? err.message : '파일을 불러오는 중 문제가 발생했습니다.',
      });
    } finally {
      setIsLoadingFile(false);
    }
  }, [selectedIds, uploads, onFileSelect, showAlert]);

  // 개별 파일 즉시 1개 가져오기
  const handleFetchSingle = useCallback(
    async (fileInfo: MyUpload) => {
      setIsLoadingFile(true);
      try {
        const file = await downloadSingleFile(fileInfo);
        onFileSelect([file]);
        showAlert({
          type: 'success',
          title: '완료',
          message: `'${fileInfo.name}' 파일을 가져왔습니다.`,
        });
      } catch (err) {
        console.error('Failed to load single file:', err);
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
              {selectedIds.length}개 선택됨
            </span>
          )}
        </div>

        <button
          type="button"
          className={styles.transferBulkFetchBtn}
          onClick={handleFetchSelected}
          disabled={selectedIds.length === 0 || disabled || isLoadingFile}
        >
          <MdDownload />
          <span>
            {isLoadingFile
              ? '가져오는 중...'
              : selectedIds.length > 0
              ? `선택한 파일 가져오기 (${selectedIds.length}개)`
              : '가져올 파일을 체크해주세요'}
          </span>
        </button>
      </div>

      <div className={styles.transferCardList}>
        {uploads.map((file) => {
          const isChecked = selectedIds.includes(file.id);
          return (
            <div
              key={file.id}
              className={`${styles.transferCardItem} ${isChecked ? styles.transferCardItemChecked : ''}`}
              onClick={() => {
                if (!disabled && !isLoadingFile) {
                  handleToggleSelect(file.id);
                }
              }}
            >
              <div
                className={styles.transferCardCheckbox}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleSelect(file.id);
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggleSelect(file.id)}
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

              <button
                type="button"
                className={styles.transferCardBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleFetchSingle(file);
                }}
                disabled={disabled || isLoadingFile}
                title="이 파일 바로 가져오기"
              >
                <span>가져오기</span>
                <MdArrowForward />
              </button>
            </div>
          );
        })}
      </div>

      {previewFile && <ExcelPreviewModal file={previewFile} onClose={closePreview} />}
    </div>
  );
});

export default TransferredFileSelect;
