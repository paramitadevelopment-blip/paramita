'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { formatJuminForDisplay } from '@/lib/columnAliases';
import type { ReapplyNotice } from '@/app/hooks/useReapplyNotices';
import styles from '../page.module.css';

interface ReapplyTableProps {
  notices: ReapplyNotice[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onRead: (id: number) => void;
  isMarking: boolean;
  /** 관리자만 어느 지사 건인지 볼 필요가 있다. 지사는 전부 자기 것이다. */
  showGroup: boolean;
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

/** 두 번호가 같으면 한 번만 보여준다. 다르면 줄을 나눈다. */
function formatPhones(tel1: string | null, tel2: string | null): React.ReactNode {
  const a = (tel1 ?? '').trim();
  const b = (tel2 ?? '').trim();
  if (!a && !b) return '-';
  if (!a) return b;
  if (!b || a === b) return a;
  return (
    <>
      {a}
      <br />
      {b}
    </>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('ko-KR').replace(/\.$/, '')} ${d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/**
 * 사유를 짧게 줄인다.
 *
 * 표에서는 무엇 때문에 빠졌는지만 알면 된다. 전체 문구는 title로 남긴다.
 */
function shortReason(reason: string): string {
  if (reason.startsWith('30일 내 이름+전화')) return '중복 (이름+전화)';
  if (reason.startsWith('30일 내 이름+생년월일')) return '중복 (번호 교차)';
  if (reason.startsWith('블랙리스트')) return '블랙리스트';
  if (reason.startsWith('60일 내 3회')) return '블랙리스트 (3회)';
  return reason;
}

const ReapplyTable = memo(function ReapplyTableComponent({
  notices,
  sortBy,
  sortOrder,
  onSort,
  onRead,
  isMarking,
  showGroup,
}: ReapplyTableProps) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableHeader
              label="고객명"
              column="customer_name"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <th>생년월일</th>
            <th>전화번호</th>
            <SortableHeader
              label="이전 배정된 날"
              column="previous_applied_at"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            {showGroup && <th>배정 소속</th>}
            <SortableHeader
              label="다시 신청한 날"
              column="applied_at"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="결과"
              column="reason"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <th>확인</th>
          </tr>
        </thead>
        <tbody>
          {notices.map((notice) => (
            <tr key={notice.id} className={notice.read_at ? styles.rowRead : undefined}>
              <td>{notice.customer_name || '-'}</td>
              <td>{formatJuminForDisplay(notice.birth)}</td>
              <td>{formatPhones(notice.tel1, notice.tel2)}</td>
              <td>{formatDate(notice.previous_applied_at)}</td>
              {showGroup && <td>{notice.assigned_dept}</td>}
              <td>{formatDate(notice.applied_at)}</td>
              <td className={styles.reasonCell} title={notice.reason}>
                <span
                  className={`${styles.reasonBadge} ${
                    notice.reason.includes('블랙리스트') || notice.reason.includes('3회')
                      ? styles.reasonBlack
                      : styles.reasonDup
                  }`}
                >
                  {shortReason(notice.reason)}
                </span>
              </td>
              <td>
                {notice.read_at ? (
                  <span className={styles.readAt} title={formatDate(notice.read_at)}>
                    확인함
                  </span>
                ) : (
                  <button
                    className={styles.readBtn}
                    onClick={() => onRead(notice.id)}
                    disabled={isMarking}
                  >
                    확인
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default ReapplyTable;
