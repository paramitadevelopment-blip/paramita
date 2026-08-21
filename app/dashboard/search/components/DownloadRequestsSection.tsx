'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import Pagination from '@/app/components/Pagination/Pagination';
import RequesterInfoModal, { type RequesterInfo } from './RequesterInfoModal';
import styles from '../page.module.css';

interface DownloadRequest {
  id: number;
  file_id: string;
  file_name: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reason: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
  user_username: string | null;
  user_name: string | null;
  user_employee_id: string | null;
  user_department: string | null;
}

interface DownloadRequestsSectionProps {
  searchQuery: string;
  onPreview: (fileId: string, fileName: string) => void;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

const STATUS_LABEL: Record<DownloadRequest['status'], string> = {
  pending: '대기',
  approved: '승인',
  rejected: '거부',
};

// 승인 화면과 같은 배지 색을 쓴다. 화면마다 색이 다르면 같은 상태를 다르게 읽는다.
const STATUS_CLASS: Record<DownloadRequest['status'], string> = {
  pending: styles.statusPending,
  approved: styles.statusApproved,
  rejected: styles.statusRejected,
};

function DownloadRequestsSection({
  searchQuery,
  onPreview,
  formatDateTime,
}: DownloadRequestsSectionProps) {
  const [sortBy, setSortBy] = useState<string>('requested_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [requesterInfo, setRequesterInfo] = useState<RequesterInfo | null>(null);

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-download-requests', searchQuery],
    queryFn: async () => {
      if (!searchQuery) return { records: [] };
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '100',
        page: '1',
      });
      const res = await fetch(`/api/download-requests?${params}`, {
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });
      if (!res.ok) return { records: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
  });

  const data: DownloadRequest[] = useMemo(
    () => (response?.records || []) as DownloadRequest[],
    [response]
  );

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  }, [sortBy, sortOrder]);

  const sortedData = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
      // 요청자·소속은 계정이 지워지면 비어 있을 수 있다. 빈 값끼리 비교가
      // 어느 쪽으로도 참이 아니면 정렬이 뒤죽박죽 되므로 빈 문자열로 맞춘다.
      const aVal = a[sortBy as keyof DownloadRequest] ?? '';
      const bVal = b[sortBy as keyof DownloadRequest] ?? '';
      if (aVal === bVal) return 0;
      return sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
    });
    return sorted;
  }, [data, sortBy, sortOrder]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedData.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedData, page]);

  if (!searchQuery) return null;

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>
        파일 다운로드 승인
        <span className={styles.sectionCount}>({data.length}건)</span>
      </h2>
      {data.length > 0 ? (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.sortable} onClick={() => handleSort('file_name')}>
                  <div className={styles.headerContent}>
                    <span>파일명</span>
                    {sortBy === 'file_name' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th className={styles.sortable} onClick={() => handleSort('user_username')}>
                  <div className={styles.headerContent}>
                    <span>요청자</span>
                    {sortBy === 'user_username' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th className={styles.sortable} onClick={() => handleSort('user_department')}>
                  <div className={styles.headerContent}>
                    <span>소속</span>
                    {sortBy === 'user_department' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th className={styles.sortable} onClick={() => handleSort('status')}>
                  <div className={styles.headerContent}>
                    <span>상태</span>
                    {sortBy === 'status' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th>요청 사유</th>
                <th className={styles.sortable} onClick={() => handleSort('requested_at')}>
                  <div className={styles.headerContent}>
                    <span>요청 일시</span>
                    {sortBy === 'requested_at' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((req) => (
                <tr key={req.id}>
                  <td
                    className={styles.fileNameCell}
                    onClick={() => onPreview(req.file_id, req.file_name)}
                  >
                    {req.file_name}
                  </td>
                  {/* 승인 화면과 같이 아이디만 보여준다. 이름·사번은 눌러서 모달로 본다. */}
                  <td
                    className={styles.clickableCell}
                    onClick={() =>
                      setRequesterInfo({
                        title: '요청자 정보',
                        username: req.user_username,
                        name: req.user_name,
                        employeeId: req.user_employee_id,
                        department: req.user_department,
                        fileName: req.file_name,
                        extras: [
                          { label: '요청 사유', value: req.reason || '-' },
                          { label: '요청 일시', value: formatDateTime(req.requested_at) },
                        ],
                      })
                    }
                  >
                    {req.user_username || '-'}
                  </td>
                  <td>{req.user_department || '-'}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${STATUS_CLASS[req.status] || ''}`}>
                      {STATUS_LABEL[req.status] || req.status}
                    </span>
                  </td>
                  {/* 거부된 건은 거부 사유가 더 중요해 함께 보여준다. */}
                  <td className={styles.reasonCell} title={req.reason || ''}>
                    {req.reason || '-'}
                    {req.review_reason ? ` / 거부: ${req.review_reason}` : ''}
                  </td>
                  <td>{formatDateTime(req.requested_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedData.length > 0 && (
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(sortedData.length / ITEMS_PER_PAGE)}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          )}
          <RequesterInfoModal info={requesterInfo} onClose={() => setRequesterInfo(null)} />
        </>
      ) : (
        <div className={styles.noResults}>검색 결과 없음</div>
      )}
    </div>
  );
}

export default memo(DownloadRequestsSection);
