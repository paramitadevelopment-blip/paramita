'use client';

import { memo, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClient } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import { useUploadFiles, useDeployFiles } from '@/app/hooks/useFileUpload';
import { useAutoClassify, type ClassifiedFile } from '@/app/hooks/useAutoClassify';
import { MdChevronLeft, MdChevronRight } from 'react-icons/md';
import ExcelPreviewModal from '../../download/components/ExcelPreviewModal';
import styles from '../page.module.css';

interface Department {
  id: number;
  name: string;
}

interface ClassificationResultModalProps {
  departments: Department[];
  classificationResults: Record<number, number>;
  files: File[];
  onClose: () => void;
  queryClient: QueryClient;
}

class SessionExpiredError extends Error {}

async function rollbackUploadedFiles(fileIds: string[]) {
  if (fileIds.length === 0) return;
  try {
    await fetch('/api/files/delete', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': getCsrfToken(),
      },
      body: JSON.stringify({ fileIds }),
    });
  } catch (rollbackError) {
    console.error('Rollback failed:', rollbackError);
  }
}

const ClassificationResultModal = memo(function ClassificationResultModalComponent({
  departments,
  classificationResults: initialResults,
  files,
  onClose,
}: ClassificationResultModalProps) {
  const router = useRouter();
  const { showAlert } = useAlert();
  const logout = useAuthStore((state) => state.logout);

  const [classificationResults, setClassificationResults] = useState<Record<number, number>>(initialResults);
  const [autoClassifyAttempted, setAutoClassifyAttempted] = useState(false);
  const [classifiedFiles, setClassifiedFiles] = useState<ClassifiedFile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preview, setPreview] = useState<{ title: string; rows: any[][] } | null>(null);

  // 현재 보고 있는 파일의 결과
  const current: ClassifiedFile | null = classifiedFiles[currentIndex] ?? null;

  const uploadMutation = useUploadFiles();
  const deployMutation = useDeployFiles();
  const autoClassifyMutation = useAutoClassify();

  // 엑셀 파일이 있으면 자동 분류 시도
  useEffect(() => {
    if (autoClassifyAttempted || files.length === 0) return;

    setAutoClassifyAttempted(true);

    // 선택한 엑셀 파일 전부를 분류한다 (배포도 전부를 대상으로 하므로 화면 수치와 맞춰야 함)
    const excelFiles = files.filter(
      (f) => f.name.toLowerCase().endsWith('.xlsx') ||
             f.name.toLowerCase().endsWith('.xls') ||
             f.name.toLowerCase().endsWith('.csv')
    );

    if (excelFiles.length === 0) {
      // 엑셀 파일 없으면 수동 입력한 결과 사용
      return;
    }

    autoClassifyMutation.mutate(excelFiles, {
      onSuccess: (result) => {
        setClassificationResults(result.classificationByDeptId);
        setClassifiedFiles(result.files ?? []);
        setCurrentIndex(0);
        if (result.errorCount > 0) {
          showAlert({
            type: 'warning',
            title: '분류 완료',
            message: `${result.totalRows}건 중 ${result.errorCount}개 행에 오류가 있습니다.`,
          });
        }
      },
      onError: (error) => {
        showAlert({
          type: 'error',
          title: '자동 분류 실패',
          message: error instanceof Error ? error.message : '자동 분류 중 오류가 발생했습니다.',
        });
        // 오류 시 수동 입력한 결과 유지
        setClassificationResults(initialResults);
      },
    });
  }, [autoClassifyAttempted, files, autoClassifyMutation, initialResults, showAlert]);

  const handleDeploy = async () => {
    try {
      const uploadedIds = await uploadMutation.mutateAsync(files);
      await deployMutation.mutateAsync({
        files: uploadedIds,
        classificationResults,
      });
      onClose();
      showAlert({
        type: 'success',
        title: '배포 완료',
        message: '파일이 배포되었습니다.',
      });
    } catch (error) {
      showAlert({
        type: 'error',
        title: '배포 실패',
        message: error instanceof Error ? error.message : '배포 중 오류가 발생했습니다.',
      });
    }
  };

  const isLoading = autoClassifyMutation.isPending || uploadMutation.isPending || deployMutation.isPending;

  // 전체 오류 개수 계산
  const totalErrorCount = classifiedFiles.reduce((sum, file) => sum + file.errorCount, 0);
  const canDeploy = totalErrorCount === 0 && classifiedFiles.length > 0;

  return (
    <div className={styles.modal}>
      <div className={styles.modalContent}>
        <div className={styles.modalTitleBar}>
          <h2 className={styles.modalTitle}>
            {autoClassifyMutation.isPending ? '분류 중...' : '분류 완료'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#999',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <div className={styles.resultContainer}>
          {autoClassifyMutation.isPending ? (
            <div className={styles.loadingContainer}>
              <div className={styles.spinner} />
              <p>파일을 자동으로 분류 중입니다...</p>
            </div>
          ) : current ? (
            <>
              <div className={styles.filePager}>
                <button
                  type="button"
                  className={styles.filePagerBtn}
                  onClick={() => setCurrentIndex((i) => i - 1)}
                  disabled={currentIndex === 0}
                  aria-label="이전 파일"
                >
                  <MdChevronLeft />
                </button>

                <div className={styles.filePagerInfo}>
                  <span className={styles.filePagerName} title={current.fileName}>
                    {current.fileName}
                  </span>
                  <span className={styles.filePagerCount}>
                    {currentIndex + 1}/{classifiedFiles.length}
                  </span>
                </div>

                <button
                  type="button"
                  className={styles.filePagerBtn}
                  onClick={() => setCurrentIndex((i) => i + 1)}
                  disabled={currentIndex >= classifiedFiles.length - 1}
                  aria-label="다음 파일"
                >
                  <MdChevronRight />
                </button>
              </div>

              <div
                className={styles.originalDataInfo}
                style={{ cursor: current.originalRows.length > 0 ? 'pointer' : 'default' }}
                onClick={() => {
                  if (current.originalRows.length === 0) return;
                  setPreview({ title: `${current.fileName} — 원본 데이터`, rows: current.originalRows });
                }}
              >
                <span className={styles.resultLabel}>원본 데이터</span>
                <span className={styles.resultCount}>{current.totalRows}건</span>
              </div>

              <div className={styles.departmentResults}>
                {departments
                  .filter((dept) => dept.name !== '관리자')
                  .map((dept) => {
                    const count = current.classificationByDeptId[dept.id] || 0;
                    const deptRows = current.rowsByDeptId[dept.id] ?? [];
                    return (
                    <div
                      key={dept.id}
                      className={styles.resultItem}
                      style={{ cursor: deptRows.length > 0 ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (deptRows.length === 0) return;
                        setPreview({ title: `${current.fileName} — ${dept.name}`, rows: deptRows });
                      }}
                    >
                      <div className={styles.resultDeptName}>{dept.name}</div>
                      <div className={styles.resultCountWrapper}>
                        <span className={styles.resultCount}>{count}건</span>
                        <span className={styles.checkMark}>✓</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          <div className={styles.resultActions}>
            <button
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isLoading}
            >
              취소
            </button>
            <button
              className={styles.deployBtn}
              onClick={handleDeploy}
              disabled={isLoading || !canDeploy}
              title={!canDeploy && totalErrorCount > 0 ? `${totalErrorCount}개 행에 오류가 있어 배포할 수 없습니다.` : ''}
            >
              {autoClassifyMutation.isPending ? '분류 중...' : uploadMutation.isPending ? '업로드 중...' : deployMutation.isPending ? '배포 중...' : totalErrorCount > 0 ? `${totalErrorCount}개 오류 (배포 불가)` : '배포하기'}
            </button>
          </div>
        </div>
      </div>

      {preview && current && (
        <ExcelPreviewModal
          title={preview.title}
          data={{ headers: current.previewHeaders, rows: preview.rows }}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
});

export default ClassificationResultModal;
