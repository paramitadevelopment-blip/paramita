'use client';

import React, { useMemo, memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import Link from 'next/link';
import styles from '../page.module.css';

interface DownloadRecord {
  id: number;
  downloaded_by: string;
  file_id: number;
  file_name: string;
  user_department: string;
  downloaded_at: string;
  ip_address: string | null;
  device_type: string | null;
  os_name: string | null;
  browser_name: string | null;
}

interface RecentDownloadsSectionProps {
  records: DownloadRecord[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  onFileClick: (fileId: string, fileName: string) => void;
  onRecordClick: (record: DownloadRecord) => void;
}

function RecentDownloadsSection({
  records,
  sortBy,
  sortOrder,
  onSort,
  onFileClick,
  onRecordClick,
}: RecentDownloadsSectionProps) {
  const sortedDownloads = useMemo(() => {
    if (!records) return [];
    const sorted = [...records];
    sorted.sort((a, b) => {
      let aVal: any = a[sortBy as keyof DownloadRecord];
      let bVal: any = b[sortBy as keyof DownloadRecord];

      if (sortBy === 'downloaded_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else {
        // IP·OS·브라우저는 값이 없을 수 있다. null끼리, null과 문자열의 비교는
        // 어느 쪽으로도 참이 아니라 정렬이 뒤죽박죽 되므로 빈 문자열로 맞춘다.
        aVal = aVal ?? '';
        bVal = bVal ?? '';
      }

      if (aVal === bVal) return 0;

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [records, sortBy, sortOrder]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #e0e0e0' }}>
        <h3 className={styles.statisticsTitle}>최근 다운로드한 사용자 (최근 5명)</h3>
        <Link href="/dashboard/download-history" style={{ fontSize: '22px', color: '#db1a62', textDecoration: 'none', fontWeight: 600, cursor: 'pointer' }}>
          더보기 +
        </Link>
      </div>
      {records && records.length > 0 ? (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th style={{ cursor: 'pointer' }} onClick={() => onSort('downloaded_by')}>
                  <div className={styles.headerContent}>
                    <span>사용자명</span>
                    {sortBy === 'downloaded_by' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
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
                <th style={{ cursor: 'pointer' }} onClick={() => onSort('ip_address')}>
                  <div className={styles.headerContent}>
                    <span>IP 주소</span>
                    {sortBy === 'ip_address' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => onSort('device_type')}>
                  <div className={styles.headerContent}>
                    <span>기기 종류</span>
                    {sortBy === 'device_type' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => onSort('os_name')}>
                  <div className={styles.headerContent}>
                    <span>OS</span>
                    {sortBy === 'os_name' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => onSort('browser_name')}>
                  <div className={styles.headerContent}>
                    <span>브라우저</span>
                    {sortBy === 'browser_name' && (
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
              {sortedDownloads.map((record) => (
                <tr
                  key={record.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onRecordClick(record)}
                >
                  <td>{record.downloaded_by}</td>
                  <td
                    style={{ cursor: 'pointer', color: '#db1a62', textDecoration: 'underline' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onFileClick(String(record.file_id), record.file_name);
                    }}
                  >
                    {record.file_name}
                  </td>
                  <td>{record.user_department || '-'}</td>
                  <td>{record.ip_address || '-'}</td>
                  <td>{record.device_type || '-'}</td>
                  <td>{record.os_name || '-'}</td>
                  <td>{record.browser_name || '-'}</td>
                  <td>{new Date(record.downloaded_at).toLocaleDateString('ko-KR').slice(0, -1)} {new Date(record.downloaded_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState message="다운로드 이력이 없습니다." />
      )}
    </div>
  );
}

export default memo(RecentDownloadsSection);
