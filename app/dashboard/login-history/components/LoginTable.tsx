'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import type { LoginRecord } from '@/app/hooks/useLoginRecords';
import styles from '../page.module.css';

interface LoginTableProps {
  records: LoginRecord[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
}

const SortableHeader = memo(function SortableHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
}) {
  return (
    <th className={styles.sortableHeader} onClick={() => onSort(column)}>
      <div className={styles.headerContent}>
        <span>{label}</span>
        {/* 켜지지 않은 열도 자리는 잡아 둔다 — 켤 때 넓어지면 옆 칸이 접힌다. */}
        <span
          className={`${styles.sortIcon} ${
            sortBy === column ? '' : styles.sortIconIdle
          }`}
        >
          {sortBy === column && sortOrder === 'desc' ? (
            <MdArrowDropDown />
          ) : (
            <MdArrowDropUp />
          )}
        </span>
      </div>
    </th>
  );
});

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('ko-KR').replace(/\.$/, '')} ${d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

/**
 * 기기·브라우저를 한 칸으로 합친다.
 *
 * 셋을 따로 두면 열이 늘어나기만 하고, 실제로는 "어디서 들어왔나"를 한눈에
 * 보려는 것이라 붙여 놓는 편이 읽기 쉽다.
 */
function formatDevice(record: LoginRecord): string {
  const parts = [record.os_name, record.browser_name].filter(Boolean);
  if (parts.length === 0) return record.device_type || '-';
  return `${parts.join(' · ')}${record.device_type && record.device_type !== 'desktop' ? ` (${record.device_type})` : ''}`;
}

const LoginTable = memo(function LoginTableComponent({
  records,
  sortBy,
  sortOrder,
  onSort,
}: LoginTableProps) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableHeader
              label="아이디"
              column="username"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="이름"
              column="user_name"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="소속"
              column="user_department"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="결과"
              column="success"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="IP"
              column="ip_address"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            {/* 화면에 합쳐 보여주는 값이라 정렬도 서버에서 OS·브라우저 순으로 건다. */}
            <SortableHeader
              label="기기"
              column="device"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="시각"
              column="logged_in_at"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className={record.success ? undefined : styles.rowFailed}>
              <td>{record.username}</td>
              {/* 없는 아이디로 시도하면 이름·소속이 없다. 그 자체가 단서다. */}
              <td>{record.user_name || '-'}</td>
              <td>{record.user_department || '-'}</td>
              <td>
                <span
                  className={`${styles.resultBadge} ${
                    record.success ? styles.resultSuccess : styles.resultFailed
                  }`}
                  title={record.fail_reason ?? ''}
                >
                  {record.success ? '성공' : record.fail_reason || '실패'}
                </span>
              </td>
              <td>{record.ip_address || '-'}</td>
              <td className={styles.deviceCell} title={formatDevice(record)}>
                {formatDevice(record)}
              </td>
              <td>{formatDate(record.logged_in_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default LoginTable;
