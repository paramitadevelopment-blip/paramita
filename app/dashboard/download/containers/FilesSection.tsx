'use client';

import { useState, useCallback, useMemo, useEffect, memo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { useDepartments } from '@/app/hooks/useDepartments';
import { useDownloadFile, useDeleteFiles, usePreviewFile } from '@/app/hooks/useFileDownload';
import { useRedownloadRequest } from '@/app/hooks/useRedownloadRequest';
import { useAllFiles } from '@/app/hooks/useFileUpload';
import { useDistributedFiles, type DistributedFile } from '@/app/hooks/useDistributedFiles';
import { useFileModals } from '@/app/hooks/useFileModals';
import { useFileSelection } from '@/app/hooks/useFileSelection';
import { invalidateDashboard } from '@/app/hooks/useDashboardCache';
import { useAlert } from '@/app/components/Alert/Alert';
import { toDepartmentGroups, getSubDepartments } from '@/lib/departments';
import Spinner from '@/app/components/Spinner/Spinner';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import SearchBar from '@/app/components/SearchBar';
import ExcelPreviewModal from '../components/ExcelPreviewModal';
import DownloadLogsModal from '../components/DownloadLogsModal';
import AllDeleteModal from '../components/AllDeleteModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import FileTable from '../components/FileTable';
import RedownloadRequestModal from '../components/RedownloadRequestModal';
import RedownloadHistoryModal from '../components/RedownloadHistoryModal';
import styles from '../page.module.css';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploaded_at: string;
  uploaded_by: string;
  /** 계정을 지워도 남는 이름. 관리자 화면에만 보여준다. */
  uploaded_by_name?: string | null;
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

// 서버와 DB CHECK가 쓰는 한도와 같은 값. 여기서 막는 건 UX용이고 실제 방어는 API에 있다.
const REASON_MAX_LENGTH = 500;

const FilesSection = memo(function FilesSectionComponent({ showDepartmentFilter = true, showOriginal = false }: FilesSectionProps) {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'subadmin';
  const logout = useAuthStore((state) => state.logout);
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();
  const downloadMutation = useDownloadFile();
  const previewMutation = usePreviewFile();
  const redownloadRequestMutation = useRedownloadRequest();
  const deleteFilesMutation = useDeleteFiles();
  // 소속 필터는 관리자에게만 보인다. 일반 사용자까지 부서 목록을 받아올 이유가 없다.
  const { data: departmentsData } = useDepartments(isAdmin && showDepartmentFilter);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  // 조직 단위 선택('파라인슈')과 그 안의 분류 선택('파라인슈1')은 별개다.
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedSubDepartment, setSelectedSubDepartment] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'available' | 'downloaded' | 'pending_request' | 'rejected' | ''>('');
  const [historyFile, setHistoryFile] = useState<{ id: string; name: string } | null>(null);
  const [redownloadModalOpen, setRedownloadModalOpen] = useState(false);
  const [redownloadReason, setRedownloadReason] = useState('');
  const [redownloadFileId, setRedownloadFileId] = useState<string | null>(null);
  const [redownloadFileName, setRedownloadFileName] = useState<string>('');

  const { selectedFileIds, setSelectedFileIds, handleSelectAll, handleSelectFile, clearSelection } = useFileSelection();
  const {
    previewFile, setPreviewFile, closePreview,
    deleteModalOpen, setDeleteModalOpen, deleteModalData, setDeleteModalData,
    selectedDistributedFileIds, setSelectedDistributedFileIds, deleteReason, setDeleteReason,
    closeDeleteModal,
    downloadLogsModalOpen, setDownloadLogsModalOpen, selectedFileForLogs, setSelectedFileForLogs,
    closeDownloadLogsModal,
    allDeleteModalOpen, setAllDeleteModalOpen, allDeleteCode, setAllDeleteCode,
    allDeleteVerification, setAllDeleteVerification, allDeleteWithDistributed, setAllDeleteWithDistributed,
    allDeleteReason, setAllDeleteReason, closeAllDeleteModal,
  } = useFileModals();

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
    queryKey: ['files', page, search, limit, sortBy, sortOrder, selectedDepartment, selectedSubDepartment, selectedStatus, showOriginal],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        sortBy,
        sortOrder,
        // 하위 분류를 콕 집었으면 그것만, 아니면 조직 전체를 본다.
        department: selectedSubDepartment,
        departmentGroup: selectedSubDepartment ? '' : selectedDepartment,
        status: selectedStatus,
      });

      // 원본/배포 구분은 서버에서 걸러야 한다. 여기서 안 보내면 서버가 전체를 세고
      // 전체 기준으로 잘라 보내므로, 페이지 건수와 페이지 수가 둘 다 어긋난다.
      params.append('showOriginal', showOriginal.toString());

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
    // 다른 관리자가 배포·삭제하면 바로 바뀌는 목록이다. 이 창에서 한 변경은
    // invalidateQueries가 잡아주지만, 남이 한 변경은 이 신선도만큼 늦게 보인다.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const pagination = data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
    clearSelection();
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    clearSelection();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 소속 필터는 조직 단위로 보여준다. 파라인슈1·파라인슈2는 '파라인슈' 한 줄이 된다.
  const departmentGroups = useMemo(
    () => toDepartmentGroups(departmentsData),
    [departmentsData]
  );

  // 고른 조직이 쪼개져 있을 때만 값이 있다. 아니면 하위 줄 자체를 안 그린다.
  const subDepartments = useMemo(
    () => getSubDepartments(departmentsData, selectedDepartment),
    [departmentsData, selectedDepartment]
  );

  const handleDepartmentChange = useCallback((group: string) => {
    setSelectedDepartment(group);
    // 조직을 바꾸면 이전 조직의 하위 선택은 의미가 없다.
    setSelectedSubDepartment('');
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handleSubDepartmentChange = useCallback((sub: string) => {
    setSelectedSubDepartment(sub);
    setPage(1);
    clearSelection();
  }, [clearSelection]);

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
    clearSelection();
  }, [sortBy, clearSelection]);

  // 서버가 원본/배포·상태 필터·정렬을 모두 처리해서 보내므로 여기서는 표시용 날짜만 붙인다.
  const filesWithFormattedDate = useMemo(() => {
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
        onError: (error: any) => {
          if (error?.code === 'DOWNLOAD_LIMIT_REACHED') {
            // 한도 소진인지 동시 요청 충돌인지는 서버 메시지가 구분해서 알려준다.
            showAlert({ type: 'error', title: '다운로드 한계 도달', message: error.message });
          } else {
            showAlert({ type: 'error', title: '오류', message: '파일 다운로드에 실패했습니다.' });
          }
        },
      }
    );
  }, [downloadMutation, showAlert]);

  const handleRedownloadRequest = useCallback((fileId: string, fileName: string) => {
    setRedownloadFileId(fileId);
    setRedownloadFileName(fileName);
    setRedownloadReason('');
    setRedownloadModalOpen(true);
  }, []);

  const handleRedownloadConfirm = useCallback(() => {
    if (!redownloadFileId) return;

    redownloadRequestMutation.mutate(
      { fileId: redownloadFileId, reason: redownloadReason },
      {
        onSuccess: () => {
          showAlert({ type: 'success', title: '완료', message: '재다운로드 요청이 완료되었습니다.' });
          setRedownloadModalOpen(false);
          setRedownloadReason('');
          setRedownloadFileId(null);
        },
        onError: (error: any) => {
          showAlert({ type: 'error', title: '오류', message: error?.message || '요청에 실패했습니다.' });
        },
      }
    );
  }, [redownloadFileId, redownloadReason, redownloadRequestMutation, showAlert]);

  const handleViewHistory = useCallback((fileId: string, fileName: string) => {
    setHistoryFile({ id: fileId, name: fileName });
  }, []);

  const closeHistoryModal = useCallback(() => {
    setHistoryFile(null);
  }, []);

  const closeRedownloadModal = useCallback(() => {
    setRedownloadModalOpen(false);
  }, []);

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
          // 지운 배포본이 삭제 모달 목록에 그대로 남지 않게 한다.
          queryClient.invalidateQueries({ queryKey: ['distributedFiles'], exact: false });
          invalidateDashboard(queryClient);
          closeDeleteModal();
          clearSelection();
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
            queryClient.invalidateQueries({ queryKey: ['distributedFiles'], exact: false });
            invalidateDashboard(queryClient);
            clearSelection();
            setPage(1);
            closeAllDeleteModal();
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
          {!isAdmin && !showOriginal && (
            <option value="myDownloadStatus">다운로드 상태순</option>
          )}
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

      {!isAdmin && !showOriginal && (
      <div className={styles.departmentsFilter}>
        <button
          className={`${styles.departmentBtn} ${selectedStatus === '' ? styles.active : ''}`}
          onClick={() => {
            setSelectedStatus('');
            setPage(1);
          }}
        >
          전체
        </button>
        <button
          className={`${styles.departmentBtn} ${selectedStatus === 'available' ? styles.active : ''}`}
          onClick={() => {
            setSelectedStatus('available');
            setPage(1);
          }}
        >
          다운로드 가능
        </button>
        <button
          className={`${styles.departmentBtn} ${selectedStatus === 'downloaded' ? styles.active : ''}`}
          onClick={() => {
            setSelectedStatus('downloaded');
            setPage(1);
          }}
        >
          재다운로드 요청 필요
        </button>
        <button
          className={`${styles.departmentBtn} ${selectedStatus === 'rejected' ? styles.active : ''}`}
          onClick={() => {
            setSelectedStatus('rejected');
            setPage(1);
          }}
        >
          거부됨
        </button>
        <button
          className={`${styles.departmentBtn} ${selectedStatus === 'pending_request' ? styles.active : ''}`}
          onClick={() => {
            setSelectedStatus('pending_request');
            setPage(1);
          }}
        >
          요청 대기 중
        </button>
      </div>
      )}

      {isAdmin && showDepartmentFilter && (
        <>
          <div className={styles.departmentsFilter}>
            <button
              className={`${styles.departmentBtn} ${selectedDepartment === '' ? styles.active : ''}`}
              onClick={() => handleDepartmentChange('')}
            >
              전체
            </button>
            {departmentGroups.map((group) => (
              <button
                key={group}
                className={`${styles.departmentBtn} ${selectedDepartment === group ? styles.active : ''}`}
                onClick={() => handleDepartmentChange(group)}
              >
                {group}
              </button>
            ))}
          </div>

          {/* 한 조직이 여러 분류로 쪼개진 경우에만(파라인슈 = 1 + 2) 하위 줄이 나온다. */}
          {subDepartments.length > 0 && (
            <div className={styles.subDepartmentsFilter}>
              <button
                className={`${styles.departmentBtn} ${selectedSubDepartment === '' ? styles.active : ''}`}
                onClick={() => handleSubDepartmentChange('')}
              >
                전체
              </button>
              {subDepartments.map((sub) => (
                <button
                  key={sub}
                  className={`${styles.departmentBtn} ${selectedSubDepartment === sub ? styles.active : ''}`}
                  onClick={() => handleSubDepartmentChange(sub)}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {isAdmin && (
        <div className={styles.adminActions}>
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
            onSelectAll={() => handleSelectAll(filesWithFormattedDate)}
            onSelectFile={handleSelectFile}
            onSort={handleSort}
            onPreview={handlePreview}
            onDownload={handleDownload}
            onRedownloadRequest={handleRedownloadRequest}
            onViewHistory={handleViewHistory}
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
      {previewFile && <ExcelPreviewModal file={previewFile} onClose={closePreview} />}

      <AllDeleteModal
        isOpen={allDeleteModalOpen}
        totalFiles={pagination.total}
        showOriginal={showOriginal}
        verificationCode={allDeleteCode}
        verificationInput={allDeleteVerification}
        withDistributed={allDeleteWithDistributed}
        reason={allDeleteReason}
        onClose={closeAllDeleteModal}
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
        onClose={closeDeleteModal}
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
        onClose={closeDownloadLogsModal}
      />

      <RedownloadRequestModal
        isOpen={redownloadModalOpen}
        fileName={redownloadFileName}
        reason={redownloadReason}
        maxLength={REASON_MAX_LENGTH}
        isSubmitting={redownloadRequestMutation.isPending}
        onReasonChange={setRedownloadReason}
        onClose={closeRedownloadModal}
        onConfirm={handleRedownloadConfirm}
      />

      <RedownloadHistoryModal file={historyFile} onClose={closeHistoryModal} />
    </>
  );
});

export default FilesSection;
