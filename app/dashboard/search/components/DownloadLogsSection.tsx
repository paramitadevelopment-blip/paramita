'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import Pagination from '@/app/components/Pagination/Pagination';
import styles from '../page.module.css';

interface DownloadLog {
  id: string;
  file_id: string;
  file_name: string;
  downloaded_by: string;
  downloaded_at: string;
}

interface DownloadLogsSectionProps {
  searchQuery: string;
  onPreview: (fileId: string, fileName: string) => void;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

function DownloadLogsSection({
  searchQuery,
  onPreview,
  formatDateTime,
}: DownloadLogsSectionProps) {
  const [sortBy, setSortBy] = useState<string>('downloaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-download-logs', searchQuery],
    queryFn: async () => {
      if (!searchQuery) return { records: [] };
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '100',
        page: '1',
      });
      const res = await fetch(`/api/download-history?${params}`, {
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken() },
      });
      if (!res.ok) return { records: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
  });

  const data = (response?.records || []).map((record: any) => ({
    id: record.id,
    file_id: record.file_id,
    file_name: record.file_name,
    downloaded_by: record.downloaded_by,
    downloaded_at: record.downloaded_at,
  }));

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
      const aVal = a[sortBy as keyof DownloadLog];
      const bVal = b[sortBy as keyof DownloadLog];
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
        다운로드 로그
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
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('downloaded_by')}>
                  <div className={styles.headerContent}>
                    <span>다운로드자</span>
                    {sortBy === 'downloaded_by' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('downloaded_at')}>
                  <div className={styles.headerContent}>
                    <span>다운로드 날짜</span>
                    {sortBy === 'downloaded_at' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((log: DownloadLog) => (
                <tr key={log.id}>
                  <td
                    style={{
                      cursor: 'pointer',
                      color: '#db1a62',
                      textDecoration: 'underline',
                    }}
                    onClick={() => onPreview(log.file_id, log.file_name)}
                  >
                    {log.file_name}
                  </td>
                  <td>{log.downloaded_by}</td>
                  <td>{formatDateTime(log.downloaded_at)}</td>
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

export default memo(DownloadLogsSection);
