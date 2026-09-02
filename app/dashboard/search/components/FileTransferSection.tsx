'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import Pagination from '@/app/components/Pagination/Pagination';
import ExcelPreviewModal from '@/app/dashboard/download/components/ExcelPreviewModal';
import { usePreviewMyUpload } from '@/app/hooks/useFileTransferActions';
import styles from '../page.module.css';

interface MyUpload {
  id: string;
  name: string;
  size: number;
  uploaded_at: string;
  uploaded_by_name: string | null;
}

interface FileTransferSectionProps {
  searchQuery: string;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 파일전달 대기열은 미리보기·다운로드 규칙이 원본파일 관리와 다르다
 * (/api/file-transfer/[id]를 쓴다). 다른 섹션처럼 부모의 onPreview를
 * 받으면 엉뚱한 엔드포인트(/api/files/download)로 열려고 시도하게 되므로
 * 이 섹션은 자기 미리보기 모달을 따로 들고 있는다.
 */
function FileTransferSection({ searchQuery, formatDateTime }: FileTransferSectionProps) {
  const [sortBy, setSortBy] = useState<string>('uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [previewFile, setPreviewFile] = useState<File | null>(null);

  const previewMutation = usePreviewMyUpload();

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-file-transfer', searchQuery],
    queryFn: async () => {
      if (!searchQuery) return { data: [] };
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '100',
        page: '1',
      });
      const res = await fetch(`/api/files/my-uploads?${params}`, {
        credentials: 'include',
        headers: { 'X-CSRF-Token': getCsrfToken?.() || '' },
      });
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
  });

  const data: MyUpload[] = response?.data || [];

  const handlePreview = useCallback(
    (fileId: string, fileName: string) => {
      previewMutation.mutate(
        { fileId, fileName },
        { onSuccess: (file) => setPreviewFile(file) }
      );
    },
    [previewMutation]
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
      const aVal = a[sortBy as keyof MyUpload] ?? '';
      const bVal = b[sortBy as keyof MyUpload] ?? '';
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
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
        파일전달
        <span className={styles.sectionCount}>({data.length}건)</span>
      </h2>
      {data.length > 0 ? (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.sortable} onClick={() => handleSort('name')}>
                  <div className={styles.headerContent}>
                    <span>파일명</span>
                    {sortBy === 'name' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th className={styles.sortable} onClick={() => handleSort('size')}>
                  <div className={styles.headerContent}>
                    <span>크기</span>
                    {sortBy === 'size' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th className={styles.sortable} onClick={() => handleSort('uploaded_by_name')}>
                  <div className={styles.headerContent}>
                    <span>올린 사람</span>
                    {sortBy === 'uploaded_by_name' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th className={styles.sortable} onClick={() => handleSort('uploaded_at')}>
                  <div className={styles.headerContent}>
                    <span>전달 시각</span>
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
              {paginatedData.map((upload) => (
                <tr key={upload.id}>
                  <td
                    className={styles.fileNameCell}
                    onClick={() => handlePreview(upload.id, upload.name)}
                  >
                    {upload.name}
                  </td>
                  <td>{formatSize(upload.size)}</td>
                  <td>{upload.uploaded_by_name || '-'}</td>
                  <td>{formatDateTime(upload.uploaded_at)}</td>
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

      {previewFile && (
        <ExcelPreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}

export default memo(FileTransferSection);
