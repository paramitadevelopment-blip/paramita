'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import styles from '../page.module.css';

interface DownloadRecord {
  id: number;
  file_id: number;
  file_name: string;
  downloaded_by: string;
  user_name: string;
  user_employee_id: string;
  user_department: string;
  downloaded_at: string;
}

interface DownloadHistoryTableProps {
  records: DownloadRecord[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  selectedRecordIds: Set<number>;
  onSelectAll: (checked: boolean) => void;
  onSelectRecord: (recordId: number, checked: boolean) => void;
  isAdmin: boolean;
  onFileNameClick?: (fileId: number, fileName: string) => void;
  onRecordClick?: (record: DownloadRecord) => void;
}

const DownloadHistoryTable = memo(function DownloadHistoryTableComponent({
  records,
  sortBy,
  sortOrder,
  onSort,
  selectedRecordIds,
  onSelectAll,
  onSelectRecord,
  isAdmin,
  onFileNameClick,
  onRecordClick,
}: DownloadHistoryTableProps) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            {isAdmin && (
              <th style={{ textAlign: 'center', width: '60px' }}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selectedRecordIds.size > 0 && selectedRecordIds.size === records.length}
                  onChange={(e) => onSelectAll(e.target.checked)}
                />
              </th>
            )}
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('file_name')}>
              <div className={styles.headerContent}>
                <span>파일명</span>
                {sortBy === 'file_name' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('downloaded_by')}>
              <div className={styles.headerContent}>
                <span>다운로드한 사용자</span>
                {sortBy === 'downloaded_by' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('user_department')}>
              <div className={styles.headerContent}>
                <span>소속</span>
                {sortBy === 'user_department' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('downloaded_at')}>
              <div className={styles.headerContent}>
                <span>다운로드 시간</span>
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
          {records.map((record) => (
            <tr key={record.id}>
              {isAdmin && (
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selectedRecordIds.has(record.id)}
                    onChange={(e) => onSelectRecord(record.id, e.target.checked)}
                  />
                </td>
              )}
              <td
                style={{
                  color: isAdmin ? '#db1a62' : 'inherit',
                  textDecoration: isAdmin ? 'underline' : 'none',
                  cursor: isAdmin ? 'pointer' : 'default',
                }}
                onClick={(e) => {
                  if (isAdmin && onFileNameClick) {
                    e.stopPropagation();
                    onFileNameClick(record.file_id, record.file_name);
                  }
                }}
              >
                {record.file_name}
              </td>
              <td
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRecordClick) {
                    onRecordClick(record);
                  }
                }}
              >
                {record.downloaded_by}
              </td>
              <td>{record.user_department || '-'}</td>
              <td>{new Date(record.downloaded_at).toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default DownloadHistoryTable;
