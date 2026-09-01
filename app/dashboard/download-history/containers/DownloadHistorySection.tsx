'use client';

import React, { useState, useCallback, memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { useDepartments } from '@/app/hooks/useDepartments';
import { useDownloadHistoryDelete } from '@/app/hooks/useDownloadHistoryDelete';
import { usePreviewFile } from '@/app/hooks/useFileDownload';
import { useAlert } from '@/app/components/Alert/Alert';
import { toDepartmentGroups } from '@/lib/departments';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import DownloadHistoryTable from '../components/DownloadHistoryTable';
import ExcelPreviewModal from '@/app/dashboard/download/components/ExcelPreviewModal';
import styles from '../page.module.css';

interface DownloadRecord {
  id: number;
  file_id: number;
  file_name: string;
  downloaded_by: string;
  user_name: string;
  user_employee_id: string;
  user_department: string;
  downloaded_at: string;
  ip_address: string | null;
  device_type: string;
  os_name: string | null;
  browser_name: string | null;
}

interface DownloadHistoryResponse {
  success: boolean;
  records: DownloadRecord[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

const DownloadHistorySection = memo(function DownloadHistorySectionComponent() {
  const { showAlert } = useAlert();
  const { data: departmentsData } = useDepartments();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'subadmin';
  const { deleteMutation, getAllRecordsMutation } = useDownloadHistoryDelete();
  const previewMutation = usePreviewFile();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('downloaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<number>>(new Set());
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [selectedDownloadRecord, setSelectedDownloadRecord] = useState<DownloadRecord | null>(null);
  const [isDownloadRecordModalOpen, setIsDownloadRecordModalOpen] = useState(false);

  // 이 필터가 거르는 값은 기록에 남은 user_department, 즉 사용자 소속이다.
  // 사용자 소속은 조직 단위라 배정 분류(파라인슈1)로는 아무것도 걸리지 않는다.
  const departmentGroups = useMemo(
    () => toDepartmentGroups(departmentsData),
    [departmentsData]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['downloadHistory', page, search, limit, sortBy, sortOrder, selectedDepartment],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        sortBy,
        sortOrder,
        department: selectedDepartment,
      });

      const response = await fetch(`/api/download-history?${params}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      const result = await response.json() as DownloadHistoryResponse;
      return result;
    },
    retry: 1,
  });

  const sortedRecords = useMemo(() => {
    return data?.records || [];
  }, [data?.records]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  }, [sortBy, sortOrder]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedRecordIds(new Set(sortedRecords.map((r) => r.id)));
    } else {
      setSelectedRecordIds(new Set());
    }
  }, [sortedRecords]);

  const handleSelectRecord = useCallback((recordId: number, checked: boolean) => {
    const newSet = new Set(selectedRecordIds);
    if (checked) {
      newSet.add(recordId);
    } else {
      newSet.delete(recordId);
    }
    setSelectedRecordIds(newSet);
  }, [selectedRecordIds]);

  const handleDelete = useCallback(() => {
    if (selectedRecordIds.size === 0) {
      showAlert({ type: 'warning', title: '알림', message: '삭제할 항목을 선택해주세요.' });
      return;
    }

    const count = selectedRecordIds.size;
    showAlert({
      type: 'error',
      title: '다운로드 로그 삭제',
      message: (
        <>
          선택된 <span style={{ color: '#db1a62', fontWeight: 600 }}>{count}건</span>의 로그를 정말 삭제하시겠습니까?
        </>
      ),
      showCancelButton: true,
      onConfirm: () => {
        deleteMutation.mutate(Array.from(selectedRecordIds), {
          onSuccess: () => {
            showAlert({ type: 'success', title: '완료', message: `${count}건의 로그가 삭제되었습니다.` });
          },
          onError: (error: any) => {
            showAlert({ type: 'error', title: '오류', message: error.message || '삭제 중 오류가 발생했습니다.' });
          },
        });
      },
    });
  }, [selectedRecordIds, showAlert, deleteMutation]);

  const handleAllDelete = useCallback(async () => {
    try {
      const allRecordIds = await getAllRecordsMutation.mutateAsync();

      if (allRecordIds.length === 0) {
        showAlert({ type: 'warning', title: '알림', message: '삭제할 로그가 없습니다.' });
        return;
      }

      const count = allRecordIds.length;
      showAlert({
        type: 'error',
        title: '다운로드 로그 삭제',
        message: (
          <>
            전체 <span style={{ color: '#db1a62', fontWeight: 600 }}>{count}건</span>의 로그를 정말 삭제하시겠습니까?
          </>
        ),
        showCancelButton: true,
        onConfirm: () => {
          deleteMutation.mutate(allRecordIds, {
            onSuccess: () => {
              showAlert({
                type: 'success',
                title: '완료',
                message: `${count}건의 로그가 삭제되었습니다.`,
              });
            },
            onError: (error: any) => {
              showAlert({
                type: 'error',
                title: '오류',
                message: error.message || '삭제 중 오류가 발생했습니다.',
              });
            },
          });
        },
      });
    } catch (error) {
      showAlert({
        type: 'error',
        title: '오류',
        message: '로그 조회 중 오류가 발생했습니다.',
      });
    }
  }, [getAllRecordsMutation, deleteMutation, showAlert]);

  const handleOpenExcelPreview = useCallback((fileId: number, fileName: string) => {
    previewMutation.mutate(
      { fileId: String(fileId), fileName },
      {
        onSuccess: (file) => {
          setPreviewFile(file);
          setPreviewFileName(fileName);
        },
        onError: () => {
          showAlert({ type: 'error', title: '오류', message: '파일을 읽을 수 없습니다.' });
        },
      }
    );
  }, [previewMutation, showAlert]);

  const handleCloseExcelPreview = useCallback(() => {
    setPreviewFile(null);
    setPreviewFileName('');
  }, []);

  const handleOpenDownloadRecord = useCallback((record: DownloadRecord) => {
    setSelectedDownloadRecord(record);
    setIsDownloadRecordModalOpen(true);
  }, []);

  const handleCloseDownloadRecord = useCallback(() => {
    setIsDownloadRecordModalOpen(false);
    setSelectedDownloadRecord(null);
  }, []);

  return (
    <>
      <Spinner isLoading={isLoading} />

      <div className={styles.searchSection}>
        <div className={styles.totalCount}>
          총 <span>{data?.pagination?.total || 0}</span>건
        </div>
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          onReset={() => {
            setSearch('');
            setPage(1);
          }}
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
          <option value="downloaded_at">다운로드 시간순</option>
          <option value="file_name">파일명순</option>
          <option value="downloaded_by">사용자순</option>
          <option value="user_department">소속순</option>
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
        {departmentGroups.map((group) => (
          <button
            key={group}
            className={`${styles.departmentBtn} ${selectedDepartment === group ? styles.active : ''}`}
            onClick={() => {
              setSelectedDepartment(group);
              setPage(1);
            }}
          >
            {group}
          </button>
        ))}
      </div>

      {isAdmin && (
        <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
          <button
            className={styles.bulkDeleteBtn}
            onClick={handleDelete}
            disabled={deleteMutation.isPending || selectedRecordIds.size === 0}
          >
            선택된 항목 삭제 ({selectedRecordIds.size})
          </button>
          <button
            className={styles.allDeleteBtn}
            onClick={handleAllDelete}
            disabled={deleteMutation.isPending || getAllRecordsMutation.isPending}
          >
            전체 삭제
          </button>
        </div>
      )}

      {error ? (
        <EmptyState message="다운로드 로그를 불러올 수 없습니다." />
      ) : sortedRecords.length === 0 ? (
        <EmptyState message={search ? '검색 결과가 없습니다.' : '다운로드 기록이 없습니다.'} />
      ) : (
        <DownloadHistoryTable
          records={sortedRecords}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          selectedRecordIds={selectedRecordIds}
          onSelectAll={handleSelectAll}
          onSelectRecord={handleSelectRecord}
          isAdmin={isAdmin}
          onFileNameClick={handleOpenExcelPreview}
          onRecordClick={handleOpenDownloadRecord}
        />
      )}

      <Pagination
        currentPage={page}
        totalPages={data?.pagination?.pages || 1}
        onPageChange={handlePageChange}
        isLoading={isLoading}
      />

      {previewFile && (
        <ExcelPreviewModal
          file={previewFile}
          onClose={handleCloseExcelPreview}
        />
      )}

      {isDownloadRecordModalOpen && selectedDownloadRecord && (
        <div className={styles.userModalOverlay}>
          <div className={styles.userModalContent}>
            <h2 className={styles.userModalTitle}>다운로드 기록</h2>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>사용자 ID</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.downloaded_by}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>이름</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.user_name || '-'}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>사번</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.user_employee_id || '-'}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>파일명</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.file_name}</div>
            </div>

            <div className={styles.userModalField}>
              <label className={styles.userModalLabel}>소속</label>
              <div className={styles.userModalValue}>{selectedDownloadRecord.user_department || '-'}</div>
            </div>

            <div className={styles.userModalField} style={{ marginBottom: '24px' }}>
              <label className={styles.userModalLabel}>다운로드 시간</label>
              <div className={styles.userModalValue}>{new Date(selectedDownloadRecord.downloaded_at).toLocaleDateString('ko-KR').slice(0, -1)} {new Date(selectedDownloadRecord.downloaded_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            </div>

            <button className={styles.userModalCloseBtn} onClick={() => { setIsDownloadRecordModalOpen(false); setSelectedDownloadRecord(null); }}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
});

export default DownloadHistorySection;
