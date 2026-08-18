'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import Pagination from '@/app/components/Pagination/Pagination';
import styles from '../page.module.css';

interface DeletionHistory {
  id: string;
  file_id: string;
  file_name: string;
  deleted_by: string;
  deleted_at: string;
}

interface DeletionHistorySectionProps {
  searchQuery: string;
  onPreview: (fileId: string, fileName: string) => void;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

function DeletionHistorySection({
  searchQuery,
  onPreview,
  formatDateTime,
}: DeletionHistorySectionProps) {
  const [sortBy, setSortBy] = useState<string>('deleted_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-deletion-history', searchQuery],
    queryFn: async () => {
      if (!searchQuery) return { events: [] };
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '100',
        page: '1',
        matchedOnly: 'true',
      });
      const res = await fetch(`/api/files/history?${params}`, {
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });
      if (!res.ok) return { events: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
  });

  const data = (response?.events || []).flatMap((event: any) =>
    event.files.map((file: any) => ({
      id: file.id,
      file_id: file.id,
      file_name: file.name,
      deleted_by: event.deleted_by,
      deleted_at: event.deleted_at,
    }))
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
      const aVal = a[sortBy as keyof DeletionHistory];
      const bVal = b[sortBy as keyof DeletionHistory];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
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
        파일 삭제 히스토리
        <span style={{ fontSize: '22px', fontWeight: 400, color: '#999', marginLeft: '12px' }}>
          ({data.length}건)
        </span>
      </h2>
      {data.length > 0 ? (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('file_name')}>
                  <div className={styles.headerContent}>
                    <span>파일명</span>
                    {sortBy === 'file_name' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('deleted_at')}>
                  <div className={styles.headerContent}>
                    <span>삭제 날짜</span>
                    {sortBy === 'deleted_at' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((history: DeletionHistory) => (
                <tr key={history.id}>
                  <td
                    style={{
                      cursor: 'pointer',
                      color: '#db1a62',
                      textDecoration: 'underline',
                    }}
                    onClick={() => onPreview(history.file_id, history.file_name)}
                  >
                    {history.file_name}
                  </td>
                  <td>{formatDateTime(history.deleted_at)}</td>
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
        </>
      ) : (
        <div className={styles.noResults}>검색 결과 없음</div>
      )}
    </div>
  );
}

export default memo(DeletionHistorySection);
