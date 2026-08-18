'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import Pagination from '@/app/components/Pagination/Pagination';
import styles from '../page.module.css';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploaded_at: string;
  uploaded_by: string;
  download_count: number;
  departments: { name: string } | null;
}

interface DownloadFilesSectionProps {
  searchQuery: string;
  onPreview: (fileId: string, fileName: string) => void;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

function DownloadFilesSection({
  searchQuery,
  onPreview,
  formatDateTime,
}: DownloadFilesSectionProps) {
  const [sortBy, setSortBy] = useState<string>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-download-files', searchQuery],
    queryFn: async () => {
      if (!searchQuery) return { data: [] };
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '100',
        page: '1',
        showOriginal: 'false',
      });
      const res = await fetch(`/api/files/list?${params}`, {
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken?.() || '' },
      });
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
  });

  const data = response?.data || [];

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  }, [sortBy, sortOrder]);

  const sortedData = useMemo(() => {
    if (!sortBy) return data;
    const sorted = [...data];
    sorted.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      if (sortBy === 'department') {
        aVal = a.departments?.name || '-';
        bVal = b.departments?.name || '-';
      } else {
        aVal = a[sortBy as keyof UploadedFile];
        bVal = b[sortBy as keyof UploadedFile];
      }
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
        파일 다운로드
        <span style={{ fontSize: '22px', fontWeight: 400, color: '#999', marginLeft: '12px' }}>
          ({data.length}건)
        </span>
      </h2>
      {data.length > 0 ? (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                  <div className={styles.headerContent}>
                    <span>파일명</span>
                    {sortBy === 'name' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('department')}>
                  <div className={styles.headerContent}>
                    <span>소속</span>
                    {sortBy === 'department' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('download_count')}>
                  <div className={styles.headerContent}>
                    <span>다운로드 수</span>
                    {sortBy === 'download_count' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('uploaded_at')}>
                  <div className={styles.headerContent}>
                    <span>업로드 날짜</span>
                    {sortBy === 'uploaded_at' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((file: UploadedFile) => (
                <tr key={file.id}>
                  <td
                    style={{
                      cursor: 'pointer',
                      color: '#db1a62',
                      textDecoration: 'underline',
                    }}
                    onClick={() => onPreview(file.id, file.name)}
                  >
                    {file.name}
                  </td>
                  <td>{file.departments?.name || '-'}</td>
                  <td>{file.download_count}회</td>
                  <td>{formatDateTime(file.uploaded_at)}</td>
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

export default memo(DownloadFilesSection);
