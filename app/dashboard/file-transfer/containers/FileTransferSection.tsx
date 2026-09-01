'use client';

import { useState, useCallback, useRef, memo } from 'react';
import { useAlert } from '@/app/components/Alert/Alert';
import { useUploadFiles } from '@/app/hooks/useFileUpload';
import { useMyUploads } from '@/app/hooks/useMyUploads';
import { usePreviewMyUpload, useDownloadMyUpload, useDeleteMyUpload } from '@/app/hooks/useFileTransferActions';
import Spinner from '@/app/components/Spinner/Spinner';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import FileUploadZone from '../../files/components/FileUploadZone';
import SelectedFilesList from '../components/SelectedFilesList';
import MyUploadsTable from '../components/MyUploadsTable';
import ExcelPreviewModal from '../../download/components/ExcelPreviewModal';
import DeleteReasonModal from '../components/DeleteReasonModal';
import { isValidUploadFileName, UPLOAD_FILE_NAME_HINT } from '@/lib/insurance';
import styles from '../page.module.css';

// 원본파일 관리의 삭제 사유 글자수 제한과 같은 값이다 — 같은 삭제 히스토리에
// 남는 사유라 화면마다 한도가 다르면 안 된다.
const REASON_MAX_LENGTH = 500;

function isValidExcel(file: File) {
  const fileName = file.name.toLowerCase();
  return fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
}

const FileTransferSection = memo(function FileTransferSectionComponent() {
  const { showAlert } = useAlert();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [page, setPage] = useState(1);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const limit = 10;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadMutation = useUploadFiles();
  const { data, isLoading } = useMyUploads(page, limit);
  const uploads = data?.data ?? [];
  const previewMutation = usePreviewMyUpload();
  const downloadMutation = useDownloadMyUpload();
  const deleteMutation = useDeleteMyUpload();

  // 클릭으로 고르든 끌어다 놓든 같은 검사를 거쳐야 한다.
  // 두 벌로 두면 한쪽만 고쳐져 동작이 갈린다.
  const addFiles = useCallback(
    (files: File[]) => {
      files.forEach((file) => {
        if (!isValidExcel(file)) {
          showAlert({ type: 'error', title: '오류', message: '엑셀 파일만 업로드 가능합니다.' });
          return;
        }
        // 나중에 관리자가 분류할 때 쓰는 것과 같은 규칙이다. 여기서만 막으면
        // API로는 그대로 들어가고, 분류 단계에서야 파일명 오류로 걸린다.
        if (!isValidUploadFileName(file.name)) {
          showAlert({ type: 'error', title: '오류', message: UPLOAD_FILE_NAME_HINT });
          return;
        }
        setSelectedFiles((prev) => [...prev, file]);
      });
    },
    [showAlert]
  );

  const handleRemove = useCallback((index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRemoveAll = useCallback(() => {
    setSelectedFiles([]);
  }, []);

  const handleTransfer = useCallback(() => {
    uploadMutation.mutate(selectedFiles, {
      onSuccess: () => {
        showAlert({ type: 'success', title: '완료', message: '파일을 전달했습니다.' });
        setSelectedFiles([]);
        setPage(1);
      },
      onError: (error: Error) => {
        showAlert({ type: 'error', title: '오류', message: error.message });
      },
    });
  }, [uploadMutation, selectedFiles, showAlert]);

  const handlePreview = useCallback((fileId: string, fileName: string) => {
    previewMutation.mutate(
      { fileId, fileName },
      {
        onSuccess: (file) => setPreviewFile(file),
        onError: () => {
          showAlert({ type: 'error', title: '오류', message: '파일을 열 수 없습니다.' });
        },
      }
    );
  }, [previewMutation, showAlert]);

  const closePreview = useCallback(() => setPreviewFile(null), []);

  const handleDownload = useCallback((fileId: string, fileName: string) => {
    downloadMutation.mutate(
      { fileId, fileName },
      {
        onError: () => {
          showAlert({ type: 'error', title: '오류', message: '파일 다운로드에 실패했습니다.' });
        },
      }
    );
  }, [downloadMutation, showAlert]);

  const handleDelete = useCallback((fileId: string, fileName: string) => {
    setDeleteTarget({ id: fileId, name: fileName });
    setDeleteReason('');
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteReason('');
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;

    // 프론트 검증은 UX용이고, 서버에서도 동일하게 검증한다.
    if (!deleteReason.trim()) {
      showAlert({ type: 'warning', title: '알림', message: '삭제 사유를 입력해주세요.' });
      return;
    }

    deleteMutation.mutate(
      { fileId: deleteTarget.id, reason: deleteReason },
      {
        onSuccess: () => {
          showAlert({ type: 'success', title: '완료', message: '파일이 삭제되었습니다.' });
          closeDeleteModal();
        },
        onError: (error: Error) => {
          showAlert({ type: 'error', title: '오류', message: error.message });
        },
      }
    );
  }, [deleteTarget, deleteReason, deleteMutation, showAlert, closeDeleteModal]);

  return (
    <>
      <Spinner isLoading={uploadMutation.isPending} />

      <FileUploadZone onFileSelect={addFiles} onDrop={addFiles} fileInputRef={fileInputRef} />

      <SelectedFilesList
        files={selectedFiles}
        isTransferring={uploadMutation.isPending}
        onRemove={handleRemove}
        onRemoveAll={handleRemoveAll}
        onTransfer={handleTransfer}
      />

      <h3 className={styles.sectionTitle}>업로드 내역</h3>
      {isLoading ? null : uploads.length === 0 ? (
        <EmptyState message="아직 전달한 파일이 없습니다." />
      ) : (
        <>
          <MyUploadsTable
            uploads={uploads}
            onPreview={handlePreview}
            onDownload={handleDownload}
            onDelete={handleDelete}
          />
          <Pagination
            currentPage={page}
            totalPages={data?.pagination.totalPages ?? 1}
            onPageChange={setPage}
            isLoading={isLoading}
          />
        </>
      )}

      {previewFile && <ExcelPreviewModal file={previewFile} onClose={closePreview} />}

      <DeleteReasonModal
        isOpen={deleteTarget !== null}
        fileName={deleteTarget?.name || ''}
        reason={deleteReason}
        maxLength={REASON_MAX_LENGTH}
        isSubmitting={deleteMutation.isPending}
        onReasonChange={setDeleteReason}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
});

export default FileTransferSection;
