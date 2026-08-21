'use client';

import { useState, useCallback, memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore, getCsrfToken } from '@/app/store/authStore';
import { useDepartments } from '@/app/hooks/useDepartments';
import { useRedownloadReview } from '@/app/hooks/useRedownloadReview';
import { usePreviewFile } from '@/app/hooks/useFileDownload';
import { useAlert } from '@/app/components/Alert/Alert';
import { toDepartmentGroups } from '@/lib/departments';
import ExcelPreviewModal from '../../download/components/ExcelPreviewModal';
import RequestReasonModal from '../components/RequestReasonModal';
import RequesterInfoModal from '../components/RequesterInfoModal';
import RejectReasonModal from '../components/RejectReasonModal';
import type { RequestRecord } from '../types';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import DownloadApprovalTable from '../components/DownloadApprovalTable';
import styles from '../page.module.css';

interface DownloadApprovalResponse {
  success: boolean;
  records: RequestRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// 서버와 DB CHECK가 쓰는 한도와 같은 값. 여기서 막는 건 UX용이고 실제 방어는 API에 있다.
const REASON_MAX_LENGTH = 500;

const DownloadApprovalSection = memo(function DownloadApprovalSectionComponent() {
  const { showAlert } = useAlert();
  const { data: departmentsData } = useDepartments();
  const reviewMutation = useRedownloadReview();
  const previewMutation = usePreviewFile();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('requested_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | ''>('pending');
  const [selectedRecord, setSelectedRecord] = useState<RequestRecord | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [reasonRecord, setReasonRecord] = useState<RequestRecord | null>(null);
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // 요청자의 소속으로 거르는 필터다. 사용자 소속은 조직 단위로 저장되므로
  // 배정 분류(파라인슈1)를 내놓으면 눌러도 항상 빈 목록이 된다.
  const departmentGroups = useMemo(
    () => toDepartmentGroups(departmentsData),
    [departmentsData]
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ['downloadApproval', page, search, limit, sortBy, sortOrder, selectedDepartment, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search,
        sortBy,
        sortOrder,
        department: selectedDepartment,
        status: statusFilter,
      });

      const response = await fetch(`/api/download-requests?${params}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
      });

      const result = (await response.json()) as DownloadApprovalResponse;
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

  const handleApprove = useCallback((requestId: number) => {
    reviewMutation.mutate(
      { requestId, action: 'approve' },
      {
        onSuccess: () => {
          showAlert({ type: 'success', title: '완료', message: '요청이 승인되었습니다.' });
        },
        onError: (error: any) => {
          showAlert({ type: 'error', title: '오류', message: error?.message || '처리 중 오류가 발생했습니다.' });
        },
      }
    );
  }, [reviewMutation, showAlert]);

  // 거부 사유는 사용자에게 그대로 보이므로 모달에서 반드시 받는다.
  const handleReject = useCallback((requestId: number) => {
    setRejectTargetId(requestId);
    setRejectReason('');
  }, []);

  const handleRejectConfirm = useCallback(() => {
    if (rejectTargetId === null) return;

    if (!rejectReason.trim()) {
      showAlert({ type: 'warning', title: '알림', message: '거부 사유를 입력해주세요.' });
      return;
    }

    reviewMutation.mutate(
      { requestId: rejectTargetId, action: 'reject', reason: rejectReason },
      {
        onSuccess: () => {
          showAlert({ type: 'success', title: '완료', message: '요청이 거부되었습니다.' });
          setRejectTargetId(null);
          setRejectReason('');
        },
        onError: (error: any) => {
          showAlert({ type: 'error', title: '오류', message: error?.message || '처리 중 오류가 발생했습니다.' });
        },
      }
    );
  }, [rejectTargetId, rejectReason, reviewMutation, showAlert]);

  const closeReasonModal = useCallback(() => setReasonRecord(null), []);
  const closeRequesterModal = useCallback(() => setSelectedRecord(null), []);
  const closeRejectModal = useCallback(() => setRejectTargetId(null), []);
  const closePreviewModal = useCallback(() => setPreviewFile(null), []);

  const handleOpenExcelPreview = useCallback((fileId: string, fileName: string) => {
    previewMutation.mutate(
      { fileId, fileName },
      {
        onSuccess: (file) => {
          setPreviewFile(file);
        },
        onError: () => {
          showAlert({ type: 'error', title: '오류', message: '파일을 읽을 수 없습니다.' });
        },
      }
    );
  }, [previewMutation, showAlert]);

  const pagination = data?.pagination || { page: 1, limit: 10, total: 0, pages: 1 };

  return (
    <>
      <Spinner isLoading={isLoading} />

      <div className={styles.searchSection}>
        <div className={styles.totalCount}>
          총 <span>{pagination.total || 0}</span>건
        </div>
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          onReset={() => {
            setSearch('');
            setPage(1);
          }}
          placeholder="파일명, 요청자명, 사번으로 검색"
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
          <option value="requested_at">요청 시간순</option>
          <option value="file_name">파일명순</option>
          <option value="user_name">요청자순</option>
          <option value="status">상태순</option>
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

      <div className={styles.filterGroup}>
        <div className={styles.filterLabel}>소속</div>
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
      </div>

      <div className={styles.filterGroup}>
        <div className={styles.filterLabel}>상태</div>
        <div className={styles.departmentsFilter}>
          <button
            className={`${styles.departmentBtn} ${statusFilter === '' ? styles.active : ''}`}
            onClick={() => {
              setStatusFilter('');
              setPage(1);
            }}
          >
            전체
          </button>
          <button
            className={`${styles.departmentBtn} ${statusFilter === 'pending' ? styles.active : ''}`}
            onClick={() => {
              setStatusFilter('pending');
              setPage(1);
            }}
          >
            대기
          </button>
          <button
            className={`${styles.departmentBtn} ${statusFilter === 'approved' ? styles.active : ''}`}
            onClick={() => {
              setStatusFilter('approved');
              setPage(1);
            }}
          >
            승인
          </button>
          <button
            className={`${styles.departmentBtn} ${statusFilter === 'rejected' ? styles.active : ''}`}
            onClick={() => {
              setStatusFilter('rejected');
              setPage(1);
            }}
          >
            거부
          </button>
        </div>
      </div>

      {error ? (
        <EmptyState message="요청을 불러올 수 없습니다." />
      ) : sortedRecords.length === 0 ? (
        <EmptyState message={search ? '검색 결과가 없습니다.' : '요청이 없습니다.'} />
      ) : (
        <DownloadApprovalTable
          records={sortedRecords}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          onApprove={handleApprove}
          onReject={handleReject}
          onRecordClick={setSelectedRecord}
          onFileNameClick={handleOpenExcelPreview}
          onReasonClick={setReasonRecord}
          isLoading={reviewMutation.isPending}
        />
      )}

      <Pagination
        currentPage={page}
        totalPages={pagination.pages || 1}
        onPageChange={handlePageChange}
        isLoading={isLoading}
      />

      {previewFile && (
        <ExcelPreviewModal file={previewFile} onClose={closePreviewModal} />
      )}

      <RequestReasonModal record={reasonRecord} onClose={closeReasonModal} />

      <RequesterInfoModal record={selectedRecord} onClose={closeRequesterModal} />

      <RejectReasonModal
        isOpen={rejectTargetId !== null}
        reason={rejectReason}
        maxLength={REASON_MAX_LENGTH}
        isSubmitting={reviewMutation.isPending}
        onReasonChange={setRejectReason}
        onClose={closeRejectModal}
        onConfirm={handleRejectConfirm}
      />

    </>
  );
});

export default DownloadApprovalSection;
