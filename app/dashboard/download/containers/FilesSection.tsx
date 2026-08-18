'use client';

import { useState, useCallback, useMemo, useEffect, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { useDepartments } from '@/app/hooks/useDepartments';
import { useDownloadFile, useDeleteFiles, usePreviewFile } from '@/app/hooks/useFileDownload';
import { useAllFiles } from '@/app/hooks/useFileUpload';
import { useDistributedFiles, type DistributedFile } from '@/app/hooks/useDistributedFiles';
import { useAlert } from '@/app/components/Alert/Alert';
import Spinner from '@/app/components/Spinner/Spinner';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import SearchBar from '@/app/components/SearchBar';
import ExcelPreviewModal from '../components/ExcelPreviewModal';
import DownloadLogsModal from '../components/DownloadLogsModal';
import AllDeleteModal from '../components/AllDeleteModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import FileTable from '../components/FileTable';
import styles from '../page.module.css';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploaded_at: string;
  uploaded_by: string;
  download_count: number;
  departments: {
    name: string;
  } | null;
  is_original?: boolean;
  original_file_id?: string | null;
}

interface FilesSectionProps {
  showDepartmentFilter?: boolean;
  showOriginal?: boolean;
}

// 조회 결과가 없을 때 쓰는 고정 참조. 렌더마다 새 배열을 만들지 않기 위함이다.
const EMPTY_DISTRIBUTED: DistributedFile[] = [];

const FilesSection = memo(function FilesSectionComponent({ showDepartmentFilter = true, showOriginal = false }: FilesSectionProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();
  const downloadMutation = useDownloadFile();
  const previewMutation = usePreviewFile();
  const deleteFilesMutation = useDeleteFiles();
  const { data: departmentsData } = useDepartments();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalData, setDeleteModalData] = useState<{
    fileIds: string[];
    fileNames: string[];
    hasOriginal: boolean;
    originalFileIds: string[];
  } | null>(null);
  const [selectedDistributedFileIds, setSelectedDistributedFileIds] = useState<Set<string>>(new Set());
  const [deleteReason, setDeleteReason] = useState('');
  const [downloadLogsModalOpen, setDownloadLogsModalOpen] = useState(false);
  const [selectedFileForLogs, setSelectedFileForLogs] = useState<{ id: string; name: string } | null>(null);

  // 배포 파일은 현재 페이지에 없을 수 있으므로 서버에서 원본 id로 조회한다.
  const { data: distributedData, isLoading: isLoadingDistributed } = useDistributedFiles(
    deleteModalData?.originalFileIds || []
  );

  // 기본값을 인라인 []로 두면 매 렌더마다 새 참조라 아래 useEffect가 무한 루프에 빠진다.
  const distributedFiles = distributedData ?? EMPTY_DISTRIBUTED;

  // 조회되면 기본으로 전체 선택한다.
  useEffect(() => {
    setSelectedDistributedFileIds(new Set(distributedFiles.map((f) => f.id)));
  }, [distributedFiles]);

  const { data, isLoading } = useQuery({
    queryKey: ['files', page, search, limit, sortBy, sortOrder, selectedDepartment, showOriginal],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        sortBy,
        sortOrder,
        department: selectedDepartment,
      });

      // 배포 파일 페이지만 showOriginal 파라미터 전달 (기본값: 배포 파일만 조회)
      if (!showOriginal) {
        params.append('showOriginal', 'false');
      }

      const response = await fetch(`/api/files/list?${params}`, {
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      if (response.status === 401) {
        await logout();
        throw new Error('세션이 만료되었습니다.');
      }

      if (!response.ok) {
        throw new Error('파일 목록을 불러올 수 없습니다.');
      }

      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const pagination = data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    setSelectedFileIds(new Set());
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    setSelectedFileIds(new Set());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
    setSelectedFileIds(new Set());
  }, [sortBy, sortOrder]);

  // 필터링되지 않은 모든 파일 (배포 파일 찾기용)
  const allFilesWithFormattedDate = useMemo(() => {
    if (!data?.data) return [];
    return data.data.map((file: UploadedFile) => {
      const date = new Date(file.uploaded_at);
      const dateStr = date.toLocaleDateString('ko-KR').slice(0, -1);
      const hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const period = hours >= 12 ? '오후' : '오전';
      const displayHours = String(hours % 12 || 12).padStart(2, '0');
      return {
        ...file,
        formattedDate: `${dateStr} ${period} ${displayHours}:${minutes}`,
      };
    });
  }, [data?.data]);

  // 테이블 표시용 필터링된 파일
  const filesWithFormattedDate = useMemo(() => {
    let files = allFilesWithFormattedDate;

    // showOriginal이 true면 원본 파일만, false면 배포 파일만 표시
    if (showOriginal) {
      files = files.filter((f: UploadedFile) => f.is_original);
    }

    return files;
  }, [allFilesWithFormattedDate, showOriginal]);

  const handleSelectAll = useCallback(() => {
    if (selectedFileIds.size === filesWithFormattedDate.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(filesWithFormattedDate.map((f: any) => f.id)));
    }
  }, [filesWithFormattedDate, selectedFileIds.size]);

  const handleSelectFile = useCallback((fileId: string) => {
    const newSelected = new Set(selectedFileIds);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFileIds(newSelected);
  }, [selectedFileIds]);

  const handlePreview = useCallback((fileId: string, fileName: string) => {
    previewMutation.mutate(
      { fileId, fileName },
      {
        onSuccess: (file) => {
          setPreviewFile(file);
        },
        onError: () => {
          showAlert({ type: 'error', title: '오류', message: '파일을 열 수 없습니다.' });
        },
      }
    );
  }, [previewMutation, showAlert]);

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

  const handleViewDownloadLogs = (fileId: string, fileName: string) => {
    setSelectedFileForLogs({ id: fileId, name: fileName });
    setDownloadLogsModalOpen(true);
  };

  const handleDeleteFile = useCallback((fileId: string, fileName: string) => {
    const file = filesWithFormattedDate.find((f: UploadedFile) => f.id === fileId);
    const isOriginal = file?.is_original || false;

    // 배포 파일은 useDistributedFiles가 서버에서 가져온다.
    setDeleteModalData({
      fileIds: [fileId],
      fileNames: [fileName],
      hasOriginal: isOriginal,
      originalFileIds: isOriginal ? [fileId] : [],
    });
    setSelectedDistributedFileIds(new Set());
    setDeleteReason('');
    setDeleteModalOpen(true);
  }, [filesWithFormattedDate]);

  const handleBulkDelete = useCallback(() => {
    if (selectedFileIds.size === 0) {
      showAlert({ type: 'warning', title: '알림', message: '삭제할 파일을 선택해주세요.' });
      return;
    }

    const selectedFiles = filesWithFormattedDate.filter((f: UploadedFile) => selectedFileIds.has(f.id));
    const originalFiles = selectedFiles.filter((f: UploadedFile) => f.is_original);
    const hasOriginal = originalFiles.length > 0;

    // 배포 파일은 useDistributedFiles가 서버에서 가져온다.
    setDeleteModalData({
      fileIds: Array.from(selectedFileIds),
      fileNames: selectedFiles.map((f: UploadedFile) => f.name),
      hasOriginal,
      originalFileIds: originalFiles.map((f: UploadedFile) => f.id),
    });
    setSelectedDistributedFileIds(new Set());
    setDeleteReason('');
    setDeleteModalOpen(true);
  }, [selectedFileIds, filesWithFormattedDate, showAlert]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteModalData) return;

    // 프론트 검증은 UX용이고, 서버에서도 동일하게 검증한다.
    if (!deleteReason.trim()) {
      showAlert({ type: 'warning', title: '알림', message: '삭제 사유를 입력해주세요.' });
      return;
    }

    // 원본 파일 + 선택된 배포 파일을 함께 삭제
    const filesToDelete = [
      ...deleteModalData.fileIds,
      ...Array.from(selectedDistributedFileIds),
    ];

    // 삭제할 배포 파일은 위에서 이미 선택된 것만 담았으므로 서버에서 다시 확장하지 않는다.
    deleteFilesMutation.mutate(
      {
        fileIds: filesToDelete,
        deleteDistributedFiles: false,
        reason: deleteReason,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['files'] });
          queryClient.invalidateQueries({ queryKey: ['deletionHistory'] });
          setDeleteModalOpen(false);
          setDeleteModalData(null);
          setSelectedFileIds(new Set());
          setSelectedDistributedFileIds(new Set());
          setDeleteReason('');
          showAlert({ type: 'success', title: '완료', message: '파일이 삭제되었습니다.' });
        },
        onError: (error: any) => {
          showAlert({
            type: 'error',
            title: '오류',
            message: error?.message || '파일 삭제에 실패했습니다.',
          });
        },
      }
    );
  }, [deleteModalData, selectedDistributedFileIds, deleteReason, deleteFilesMutation, queryClient, showAlert]);

  const getAllFilesMutation = useAllFiles(showOriginal);

  const [allDeleteModalOpen, setAllDeleteModalOpen] = useState(false);
  const [allDeleteCode, setAllDeleteCode] = useState('');
  const [allDeleteVerification, setAllDeleteVerification] = useState('');
  const [allDeleteWithDistributed, setAllDeleteWithDistributed] = useState(true);
  const [allDeleteReason, setAllDeleteReason] = useState('');

  const handleAllDelete = useCallback(async () => {
    if (pagination.total === 0) {
      showAlert({ type: 'warning', title: '알림', message: '삭제할 파일이 없습니다.' });
      return;
    }

    setAllDeleteCode(Math.floor(1000 + Math.random() * 9000).toString());
    setAllDeleteVerification('');
    setAllDeleteWithDistributed(true);
    setAllDeleteReason('');
    setAllDeleteModalOpen(true);
  }, [pagination.total, showAlert]);

  const handleAllDeleteConfirm = useCallback(async () => {
    if (!allDeleteReason.trim()) {
      showAlert({ type: 'warning', title: '알림', message: '삭제 사유를 입력해주세요.' });
      return;
    }

    if (allDeleteVerification !== allDeleteCode) {
      showAlert({ type: 'error', title: '오류', message: '확인 번호가 일치하지 않습니다.' });
      return;
    }

    try {
      const allFileIds = await getAllFilesMutation.mutateAsync();

      if (allFileIds.length === 0) {
        showAlert({ type: 'warning', title: '알림', message: '삭제할 파일이 없습니다.' });
        return;
      }

      deleteFilesMutation.mutate(
        {
          fileIds: allFileIds,
          deleteDistributedFiles: showOriginal && allDeleteWithDistributed,
          reason: allDeleteReason,
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['files'] });
            queryClient.invalidateQueries({ queryKey: ['deletionHistory'] });
            setSelectedFileIds(new Set());
            setPage(1);
            setAllDeleteModalOpen(false);
            setAllDeleteReason('');
            showAlert({ type: 'success', title: '완료', message: `${allFileIds.length}개의 파일이 삭제되었습니다.` });
          },
          onError: (error: any) => {
            showAlert({
              type: 'error',
              title: '오류',
              message: error?.message || '파일 삭제에 실패했습니다.',
            });
          },
        }
      );
    } catch (error) {
      console.error('Delete failed:', error);
      showAlert({ type: 'error', title: '오류', message: '파일 삭제에 실패했습니다.' });
    }
  }, [allDeleteVerification, allDeleteCode, allDeleteWithDistributed, allDeleteReason, showOriginal, getAllFilesMutation, deleteFilesMutation, queryClient, showAlert]);

  return (
    <>
      <Spinner isLoading={isLoading} />

      <div className={styles.searchSection}>
        <div className={styles.totalCount}>
          총 <span>{pagination.total || 0}개</span>
        </div>
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          onReset={() => {
            setSearch('');
            setPage(1);
          }}
          placeholder="검색어를 입력해주세요."
        />
      </div>

      <div className={styles.controlsSection}>
        <select
          className={styles.select}
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setPage(1);
          }}
        >
          <option value="name">파일명순</option>
          <option value="size">크기순</option>
          <option value="uploaded_at">업로드 날짜순</option>
        </select>

        <select
          className={styles.select}
          value={limit}
          onChange={(e) => {
            setLimit(parseInt(e.target.value));
            setPage(1);
          }}
        >
          <option value="10">10개씩보기</option>
          <option value="20">20개씩보기</option>
          <option value="30">30개씩보기</option>
          <option value="50">50개씩보기</option>
        </select>
      </div>

      {user?.role === 'admin' && showDepartmentFilter && (
        <div className={styles.departmentsFilter}>
          <button
            className={`${styles.departmentBtn} ${selectedDepartment === '' ? styles.active : ''}`}
            onClick={() => {
              setSelectedDepartment('');
              setPage(1);
            }}
          >
            전체
          </button>
          {departmentsData && Array.isArray(departmentsData) ? (
            departmentsData.filter((dept) => dept.name !== '관리자').map((dept) => (
              <button
                key={dept.id}
                className={`${styles.departmentBtn} ${selectedDepartment === dept.name ? styles.active : ''}`}
                onClick={() => {
                  setSelectedDepartment(dept.name);
                  setPage(1);
                }}
              >
                {dept.name}
              </button>
            ))
          ) : null}
        </div>
      )}

      {user?.role === 'admin' && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
          <button
            className={styles.bulkDeleteBtn}
            onClick={handleBulkDelete}
            disabled={isLoading || selectedFileIds.size === 0}
          >
            선택된 항목 삭제 ({selectedFileIds.size})
          </button>
          <button
            className={styles.allDeleteBtn}
            onClick={handleAllDelete}
            disabled={isLoading || pagination.total === 0}
          >
            전체 삭제
          </button>
        </div>
      )}

      {filesWithFormattedDate.length === 0 ? (
        <EmptyState message={search ? '검색 결과가 없습니다.' : '파일이 없습니다.'} />
      ) : (
        <>
          <FileTable
            files={filesWithFormattedDate}
            selectedFileIds={selectedFileIds}
            sortBy={sortBy}
            sortOrder={sortOrder}
            userRole={user?.role}
            onSelectAll={handleSelectAll}
            onSelectFile={handleSelectFile}
            onSort={handleSort}
            onPreview={handlePreview}
            onDownload={handleDownload}
            onViewLogs={handleViewDownloadLogs}
            onDelete={handleDeleteFile}
          />

          <div className={styles.paginationWrapper}>
            <Pagination
              currentPage={pagination.page}
              totalPages={Math.max(1, pagination.totalPages)}
              onPageChange={handlePageChange}
              isLoading={isLoading}
            />
          </div>
        </>
      )}
      {previewFile && <ExcelPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}

      <AllDeleteModal
        isOpen={allDeleteModalOpen}
        totalFiles={pagination.total}
        showOriginal={showOriginal}
        verificationCode={allDeleteCode}
        verificationInput={allDeleteVerification}
        withDistributed={allDeleteWithDistributed}
        reason={allDeleteReason}
        onClose={() => setAllDeleteModalOpen(false)}
        onVerificationChange={setAllDeleteVerification}
        onWithDistributedChange={setAllDeleteWithDistributed}
        onReasonChange={setAllDeleteReason}
        onConfirm={handleAllDeleteConfirm}
      />

      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        fileNames={deleteModalData?.fileNames || []}
        hasOriginal={deleteModalData?.hasOriginal || false}
        distributedFiles={distributedFiles}
        isLoadingDistributed={isLoadingDistributed}
        selectedDistributedFileIds={selectedDistributedFileIds}
        reason={deleteReason}
        onClose={() => setDeleteModalOpen(false)}
        onSelectAllDistributed={() =>
          setSelectedDistributedFileIds(new Set(distributedFiles.map((f) => f.id)))
        }
        onDeselectAllDistributed={() => setSelectedDistributedFileIds(new Set())}
        onToggleDistributedFile={(fileId, checked) => {
          const newSet = new Set(selectedDistributedFileIds);
          if (checked) {
            newSet.add(fileId);
          } else {
            newSet.delete(fileId);
          }
          setSelectedDistributedFileIds(newSet);
        }}
        onReasonChange={setDeleteReason}
        onConfirm={handleConfirmDelete}
      />

      <DownloadLogsModal
        isOpen={downloadLogsModalOpen}
        fileId={selectedFileForLogs?.id || null}
        fileName={selectedFileForLogs?.name || ''}
        onClose={() => setDownloadLogsModalOpen(false)}
      />
    </>
  );
});

export default FilesSection;
