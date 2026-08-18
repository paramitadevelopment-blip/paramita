'use client';

import { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown, MdFileDownload, MdDelete } from 'react-icons/md';
import styles from '../page.module.css';

interface FileRow {
  id: string;
  name: string;
  size: number;
  uploaded_at: string;
  download_count: number;
  departments: { name: string } | null;
  formattedDate: string;
}

interface FileTableProps {
  files: FileRow[];
  selectedFileIds: Set<string>;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  userRole?: string;
  onSelectAll: () => void;
  onSelectFile: (fileId: string) => void;
  onSort: (column: string) => void;
  onPreview: (fileId: string, fileName: string) => void;
  onDownload: (fileId: string, fileName: string) => void;
  onViewLogs: (fileId: string, fileName: string) => void;
  onDelete: (fileId: string, fileName: string) => void;
}

const FileTable = memo(function FileTable({
  files,
  selectedFileIds,
  sortBy,
  sortOrder,
  userRole = 'user',
  onSelectAll,
  onSelectFile,
  onSort,
  onPreview,
  onDownload,
  onViewLogs,
  onDelete,
}: FileTableProps) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th style={{ width: '40px' }}>
              <input
                type="checkbox"
                checked={selectedFileIds.size === files.length && files.length > 0}
                onChange={onSelectAll}
                className={styles.checkbox}
              />
            </th>
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
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('department_id')}>
              <div className={styles.headerContent}>
                <span>소속</span>
                {sortBy === 'department_id' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            {userRole === 'admin' && (
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('download_count')}>
                <div className={styles.headerContent}>
                  <span>다운로드수</span>
                  {sortBy === 'download_count' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
            )}
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('uploaded_at')}>
              <div className={styles.headerContent}>
                <span>업로드 날짜</span>
                {sortBy === 'uploaded_at' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th style={{ width: '240px', textAlign: 'center' }}>작업</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id}>
              <td style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={selectedFileIds.has(file.id)}
                  onChange={() => onSelectFile(file.id)}
                  className={styles.checkbox}
                />
              </td>
              <td
                style={{
                  cursor: userRole === 'admin' ? 'pointer' : 'default',
                  color: userRole === 'admin' ? '#db1a62' : 'inherit',
                  textDecoration: userRole === 'admin' ? 'underline' : 'none',
                }}
                onClick={() => {
                  if (userRole === 'admin') onPreview(file.id, file.name);
                }}
              >
                {file.name}
              </td>
              <td>{(file.size / (1024 * 1024)).toFixed(2)} MB</td>
              <td>{file.departments?.name || '-'}</td>
              {userRole === 'admin' && (
                <td
                  style={{ cursor: 'pointer', color: '#db1a62' }}
                  onClick={() => onViewLogs(file.id, file.name)}
                >
                  {file.download_count}
                </td>
              )}
              <td>{file.formattedDate}</td>
              <td style={{ textAlign: 'center' }}>
                <div className={styles.actions}>
                  <button
                    className={styles.iconBtn}
                    onClick={() => onDownload(file.id, file.name)}
                    title="다운로드"
                  >
                    <MdFileDownload />
                    <span>다운로드</span>
                  </button>
                  {userRole === 'admin' && (
                    <button
                      className={`${styles.iconBtn} ${styles.delete}`}
                      onClick={() => onDelete(file.id, file.name)}
                      title="삭제"
                    >
                      <MdDelete />
                      <span>삭제</span>
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default FileTable;
