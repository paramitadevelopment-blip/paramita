'use client';

import { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown, MdFileDownload, MdDelete, MdHelpOutline, MdAccessTime, MdCancel, MdHistory } from 'react-icons/md';
import styles from '../page.module.css';

interface FileRow {
  id: string;
  name: string;
  size: number;
  uploaded_at: string;
  download_count: number;
  departments: { name: string } | null;
  uploaded_by_name?: string | null;
  formattedDate: string;
  myDownloadStatus?: 'available' | 'downloaded' | 'pending_request' | 'rejected';
  myLastRejectReason?: string | null;
  myRequestCount?: number;
  myRejectCount?: number;
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
  onRedownloadRequest?: (fileId: string, fileName: string) => void;
  onViewHistory?: (fileId: string, fileName: string) => void;
  onViewLogs: (fileId: string, fileName: string) => void;
  onDelete: (fileId: string, fileName: string) => void;
}

const FileTable = memo(function FileTableComponent({
  files,
  selectedFileIds,
  sortBy,
  sortOrder,
  userRole,
  onSelectAll,
  onSelectFile,
  onSort,
  onPreview,
  onDownload,
  onRedownloadRequest,
  onViewHistory,
  onViewLogs,
  onDelete,
}: FileTableProps) {
  const isAdmin = userRole === 'admin' || userRole === 'subadmin';
  const allSelected = files.length > 0 && files.every((f) => selectedFileIds.has(f.id));
  const someSelected = files.some((f) => selectedFileIds.has(f.id));

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colCheckbox}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={onSelectAll}
                className={styles.checkbox}
              />
            </th>
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
            <th className={styles.sortable} onClick={() => onSort('department_id')}>
              <div className={styles.headerContent}>
                <span>소속</span>
                {sortBy === 'department_id' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            {isAdmin && (
              <th className={styles.sortable} onClick={() => onSort('uploaded_by_name')}>
                <div className={styles.headerContent}>
                  <span>업로드한 사람</span>
                  {sortBy === 'uploaded_by_name' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
            )}
            {isAdmin && (
              <th className={styles.sortable} onClick={() => onSort('download_count')}>
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
            <th className={styles.sortable} onClick={() => onSort('uploaded_at')}>
              <div className={styles.headerContent}>
                <span>업로드 날짜</span>
                {sortBy === 'uploaded_at' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            {!isAdmin && (
              <th className={`${styles.sortable} ${styles.colRejectCount}`} onClick={() => onSort('myRejectCount')}>
                <div className={styles.headerContent}>
                  <span>거부 횟수</span>
                  {sortBy === 'myRejectCount' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
            )}
            <th className={`${styles.sortable} ${styles.colActions}`} onClick={() => onSort('myDownloadStatus')}>
              <div className={styles.headerContent}>
                <span>작업</span>
                {sortBy === 'myDownloadStatus' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.id}>
              <td className={styles.colCheckbox}>
                <input
                  type="checkbox"
                  checked={selectedFileIds.has(file.id)}
                  onChange={() => onSelectFile(file.id)}
                  className={styles.checkbox}
                />
              </td>
              <td
                className={isAdmin ? styles.fileNameCell : undefined}
                onClick={() => {
                  if (isAdmin) onPreview(file.id, file.name);
                }}
              >
                {file.name}
              </td>
              <td>{(file.size / (1024 * 1024)).toFixed(2)} MB</td>
              <td>{file.departments?.name || '-'}</td>
              {isAdmin && <td>{file.uploaded_by_name || '-'}</td>}
              {isAdmin && (
                <td
                  className={styles.downloadCountCell}
                  onClick={() => onViewLogs(file.id, file.name)}
                >
                  {file.download_count}
                </td>
              )}
              <td>{file.formattedDate}</td>
              {!isAdmin && (
                <td>
                  <span
                    className={`${styles.rejectCount} ${(file.myRejectCount ?? 0) > 0 ? styles.rejectCountWarn : ''}`}
                  >
                    {file.myRejectCount ?? 0}회
                  </span>
                </td>
              )}
              <td className={styles.colActions}>
                <div className={styles.actions}>
                  {isAdmin ? (
                    <button
                      className={styles.iconBtn}
                      onClick={() => onDownload(file.id, file.name)}
                      title="다운로드"
                    >
                      <MdFileDownload />
                      <span>다운로드</span>
                    </button>
                  ) : file.myDownloadStatus === 'available' ? (
                    <button
                      className={`${styles.iconBtn} ${styles.statusBtn}`}
                      onClick={() => onDownload(file.id, file.name)}
                      title="다운로드"
                    >
                      <MdFileDownload />
                      <span>다운로드</span>
                    </button>
                  ) : file.myDownloadStatus === 'downloaded' ? (
                    <button
                      className={`${styles.iconBtn} ${styles.statusBtn} ${styles.redownloadRequest}`}
                      onClick={() => onRedownloadRequest?.(file.id, file.name)}
                      title="재다운로드 요청"
                    >
                      <MdHelpOutline />
                      <span>재다운로드 요청</span>
                    </button>
                  ) : file.myDownloadStatus === 'rejected' ? (
                    <button
                      className={`${styles.iconBtn} ${styles.statusBtn} ${styles.rejected}`}
                      onClick={() => onRedownloadRequest?.(file.id, file.name)}
                      title={file.myLastRejectReason ? `거부 사유: ${file.myLastRejectReason}` : '거부됨'}
                    >
                      <MdCancel />
                      <span>거부됨 · 재요청</span>
                    </button>
                  ) : (
                    <button
                      className={`${styles.iconBtn} ${styles.statusBtn} ${styles.pendingRequest}`}
                      disabled
                      title="요청됨"
                    >
                      <MdAccessTime />
                      <span>요청됨</span>
                    </button>
                  )}
                  {!isAdmin && (file.myRequestCount ?? 0) > 0 && (
                    <button
                      className={styles.historyBtn}
                      onClick={() => onViewHistory?.(file.id, file.name)}
                      title={`요청 ${file.myRequestCount}회 · 거부 ${file.myRejectCount ?? 0}회`}
                    >
                      <MdHistory />
                      {(file.myRejectCount ?? 0) > 0 && (
                        <span className={styles.rejectBadge}>{file.myRejectCount}</span>
                      )}
                    </button>
                  )}
                  {isAdmin && (
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
