'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import Pagination from '@/app/components/Pagination/Pagination';
import RequesterInfoModal, { type RequesterInfo } from './RequesterInfoModal';
import styles from '../page.module.css';

interface DownloadLog {
  id: string;
  file_id: string;
  file_name: string;
  downloaded_by: string;
  user_name: string | null;
  user_employee_id: string | null;
  user_department: string | null;
  downloaded_at: string;
  ip_address: string | null;
  device_type: string | null;
  os_name: string | null;
  browser_name: string | null;
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
  const [requesterInfo, setRequesterInfo] = useState<RequesterInfo | null>(null);

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
    user_name: record.user_name,
    user_employee_id: record.user_employee_id,
    user_department: record.user_department,
    downloaded_at: record.downloaded_at,
    ip_address: record.ip_address,
    device_type: record.device_type,
    os_name: record.os_name,
    browser_name: record.browser_name,
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
      // IP·OS·브라우저는 값이 없을 수 있다. null은 typeof가 'object'라 아래 문자열
      // 분기를 못 타고 숫자 0끼리 비교돼 정렬이 안 되므로 빈 문자열로 맞춘다.
      const aVal = a[sortBy as keyof DownloadLog] ?? '';
      const bVal = b[sortBy as keyof DownloadLog] ?? '';
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
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('ip_address')}>
                  <div className={styles.headerContent}>
                    <span>IP 주소</span>
                    {sortBy === 'ip_address' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('device_type')}>
                  <div className={styles.headerContent}>
                    <span>기기 종류</span>
                    {sortBy === 'device_type' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('os_name')}>
                  <div className={styles.headerContent}>
                    <span>OS</span>
                    {sortBy === 'os_name' && (
                      <span className={styles.sortIcon}>
                        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                      </span>
                    )}
                  </div>
                </th>
                <th style={{ cursor: 'pointer' }} onClick={() => handleSort('browser_name')}>
                  <div className={styles.headerContent}>
                    <span>브라우저</span>
                    {sortBy === 'browser_name' && (
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
                  <td
                    className={styles.clickableCell}
                    onClick={() =>
                      setRequesterInfo({
                        title: '다운로드 기록',
                        username: log.downloaded_by,
                        name: log.user_name,
                        employeeId: log.user_employee_id,
                        department: log.user_department,
                        fileName: log.file_name,
                        extras: [
                          { label: '다운로드 시간', value: formatDateTime(log.downloaded_at) },
                          { label: 'IP 주소', value: log.ip_address || '-' },
                          {
                            label: '접속 환경',
                            value: [log.device_type, log.os_name, log.browser_name]
                              .filter(Boolean)
                              .join(' · ') || '-',
                          },
                        ],
                      })
                    }
                  >
                    {log.downloaded_by}
                  </td>
                  <td>{log.ip_address || '-'}</td>
                  <td>{log.device_type || '-'}</td>
                  <td>{log.os_name || '-'}</td>
                  <td>{log.browser_name || '-'}</td>
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
          <RequesterInfoModal info={requesterInfo} onClose={() => setRequesterInfo(null)} />
        </>
      ) : (
        <div className={styles.noResults}>검색 결과 없음</div>
      )}
    </div>
  );
}

export default memo(DownloadLogsSection);
