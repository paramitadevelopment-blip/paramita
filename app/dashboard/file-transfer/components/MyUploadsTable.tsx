'use client';

import { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown, MdFileDownload, MdDelete } from 'react-icons/md';
// 표 모양은 파일 다운로드 화면과 같은 모듈을 그대로 쓴다 — 같은 대시보드
// 안에서 표마다 여백·글자 크기가 미묘하게 다르면 다른 시스템처럼 보인다.
import styles from '../../download/page.module.css';
// 파일명 줄바꿈 방지처럼 이 화면에만 필요한 스타일은 별도 모듈에 둔다.
import localStyles from '../page.module.css';
import type { MyUpload } from '@/app/hooks/useMyUploads';

interface MyUploadsTableProps {
  uploads: MyUpload[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onPreview: (fileId: string, fileName: string) => void;
  onDownload: (fileId: string, fileName: string) => void;
  onDelete: (fileId: string, fileName: string) => void;
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const dateStr = date.toLocaleDateString('ko-KR').slice(0, -1);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? '오후' : '오전';
  const displayHours = String(hours % 12 || 12).padStart(2, '0');
  return `${dateStr} ${period} ${displayHours}:${minutes}`;
}

const MyUploadsTable = memo(function MyUploadsTable({
  uploads,
  sortBy,
  sortOrder,
  onSort,
  onPreview,
  onDownload,
  onDelete,
}: MyUploadsTableProps) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.sortable} onClick={() => onSort('name')}>
              <div className={styles.headerContent}>
                <span>파일명</span>
                {sortBy === 'name' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortable} onClick={() => onSort('size')}>
              <div className={styles.headerContent}>
                <span>크기</span>
                {sortBy === 'size' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortable} onClick={() => onSort('uploaded_by_name')}>
              <div className={styles.headerContent}>
                <span>올린 사람</span>
                {sortBy === 'uploaded_by_name' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortable} onClick={() => onSort('uploaded_at')}>
              <div className={styles.headerContent}>
                <span>전달 시각</span>
                {sortBy === 'uploaded_at' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.colActions}>작업</th>
          </tr>
        </thead>
        <tbody>
          {uploads.map((upload) => (
            <tr key={upload.id}>
              <td
                className={`${styles.fileNameCell} ${localStyles.fileNameCell}`}
                title={upload.name}
                onClick={() => onPreview(upload.id, upload.name)}
              >
                {upload.name}
              </td>
              <td>{formatSize(upload.size)}</td>
              <td>{upload.uploaded_by_name || '-'}</td>
              <td>{formatDate(upload.uploaded_at)}</td>
              <td className={styles.colActions}>
                <div className={styles.actions}>
                  <button
                    className={styles.iconBtn}
                    onClick={() => onDownload(upload.id, upload.name)}
                    title="다운로드"
                  >
                    <MdFileDownload />
                    <span>다운로드</span>
                  </button>
                  <button
                    className={`${styles.iconBtn} ${styles.delete}`}
                    onClick={() => onDelete(upload.id, upload.name)}
                    title="삭제"
                  >
                    <MdDelete />
                    <span>삭제</span>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default MyUploadsTable;
