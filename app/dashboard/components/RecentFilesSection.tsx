'use client';

import React, { useMemo, memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import Link from 'next/link';
import styles from '../page.module.css';

interface File {
  id: string;
  name: string;
  size: number;
  uploaded_at: string;
}

interface RecentFilesSectionProps {
  files: File[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  onFileClick: (fileId: string, fileName: string) => void;
}

function RecentFilesSection({
  files,
  sortBy,
  sortOrder,
  onSort,
  onFileClick,
}: RecentFilesSectionProps) {
  const sortedFiles = useMemo(() => {
    if (!files) return [];
    const sorted = [...files];
    sorted.sort((a, b) => {
      let aVal: any = a[sortBy as keyof File];
      let bVal: any = b[sortBy as keyof File];

      if (sortBy === 'uploaded_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [files, sortBy, sortOrder]);

  return (
    <div className={styles.activityCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e0e0e0', marginBottom: '16px', paddingBottom: '12px' }}>
        <h3 style={{ fontSize: '22px', fontWeight: 600, color: '#000', margin: 0, marginBottom: 0, paddingBottom: 0, border: 0 }}>최근 업로드 파일 (최근 5개)</h3>
        <Link href="/dashboard/original-files" style={{ fontSize: '22px', color: '#db1a62', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}>
          더보기 +
        </Link>
      </div>
      {files && files.length > 0 ? (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => onSort('name')}>
                  <div className={styles.headerContent}>
                    <span>파일명</span>
                    {sortBy === 'name' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => onSort('size')}>
                  <div className={styles.headerContent}>
                    <span>크기</span>
                    {sortBy === 'size' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => onSort('uploaded_at')}>
                  <div className={styles.headerContent}>
                    <span>업로드 시간</span>
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
              {sortedFiles.map((file) => (
                <tr key={file.id}>
                  <td
                    style={{ cursor: 'pointer', color: '#db1a62', textDecoration: 'underline' }}
                    onClick={() => onFileClick(file.id, file.name)}
                  >
                    {file.name}
                  </td>
                  <td>{(file.size / 1024 / 1024).toFixed(2)} MB</td>
                  <td>{new Date(file.uploaded_at).toLocaleDateString('ko-KR').slice(0, -1)} {new Date(file.uploaded_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="업로드된 파일이 없습니다." />
      )}
    </div>
  );
}

export default memo(RecentFilesSection);
