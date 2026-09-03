'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import {
  COMPLAINT_STATUS_LABEL,
  ASSIGN_TYPE_LABEL,
  MATCH_KEY_LABEL,
  type ComplaintRow,
} from '@/lib/complaints';
import type { ActionKind } from './ComplaintActionModal';
import styles from '../page.module.css';

/**
 * 민원 목록.
 *
 * 한 줄에 "누구의 민원인가 · 무슨 내용인가 · 지금 누구 차례인가"가 다 있어야
 * 한다. 상세를 따로 열어야 알 수 있으면, 목록은 그냥 넘겨야 할 줄만 늘어난다.
 */

/* 'ko-KR'은 끝에 점을 붙인다('2026. 9. 3.'). 다른 화면과 같이 그 점만 뗀다. */
const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('ko-KR').slice(0, -1) : '-';

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
        <span className={`${styles.sortIcon} ${sortBy === column ? '' : styles.sortIconIdle}`}>
          {sortBy === column && sortOrder === 'desc' ? <MdArrowDropDown /> : <MdArrowDropUp />}
        </span>
      </div>
    </th>
  );
});

interface ComplaintTableProps {
  rows: ComplaintRow[];
  isAdmin: boolean;
  isAgent: boolean;
  canAssignAgent: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onAction: (row: ComplaintRow, kind: ActionKind) => void;
}

const ComplaintTable = memo(function ComplaintTableComponent({
  rows,
  isAdmin,
  isAgent,
  canAssignAgent,
  sortBy,
  sortOrder,
  onSort,
  onAction,
}: ComplaintTableProps) {
  const sortProps = { sortBy, sortOrder, onSort };

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableHeader label="접수일자" column="received_at" {...sortProps} />
            <SortableHeader label="수령인" column="customer_name" {...sortProps} />
            <SortableHeader label="전화번호" column="phone" {...sortProps} />
            <SortableHeader label="주문번호" column="order_no" {...sortProps} />
            {/* 통화내역·처리 내용은 자유롭게 적는 글이라 글자순으로 세워도 의미가 없다. */}
            <th>통화내역</th>
            {isAdmin && <SortableHeader label="담당 지사" column="assigned_group" {...sortProps} />}
            {!isAgent && <SortableHeader label="담당 설계사" column="agent_name" {...sortProps} />}
            <SortableHeader label="상태" column="status" {...sortProps} />
            <th>처리 내용</th>
            <th>할 일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{dateText(row.received_at)}</td>
              <td>{row.customer_name}</td>
              <td>{row.phone || '-'}</td>
              <td>{row.order_no || '-'}</td>
              <td className={styles.memoCell} title={row.call_memo || ''}>
                {row.call_memo || '-'}
              </td>

              {isAdmin && (
                <td>
                  {row.assigned_group ? (
                    <>
                      {row.assigned_group}
                      {/*
                        자동으로 찾았는지 사람이 정했는지, 자동이면 무엇으로
                        찾았는지까지. "왜 이 지사로 갔나"의 답이 이 한 칸에 있다.
                      */}
                      <span className={styles.subText}>
                        {row.assign_type ? ASSIGN_TYPE_LABEL[row.assign_type] : ''}
                        {row.match_key ? ` · ${MATCH_KEY_LABEL[row.match_key] ?? row.match_key}` : ''}
                      </span>
                    </>
                  ) : (
                    <span className={styles.muted}>미정</span>
                  )}
                </td>
              )}

              {!isAgent && (
                <td>
                  {row.agent_name ? (
                    <>
                      {row.agent_name}
                      <span className={styles.subText}>
                        {row.agent_assign_type ? ASSIGN_TYPE_LABEL[row.agent_assign_type] : ''}
                      </span>
                    </>
                  ) : (
                    <span className={styles.muted}>미지정</span>
                  )}
                </td>
              )}

              <td>
                <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
                  {COMPLAINT_STATUS_LABEL[row.status]}
                </span>
              </td>

              <td className={styles.memoCell} title={row.handled_note || row.return_reason || ''}>
                {row.status === 'returned'
                  ? `반려 · ${row.return_reason ?? ''}`
                  : row.handled_note || '-'}
              </td>

              {/*
                할 수 있는 것만 버튼으로 낸다. 못 하는 동작을 눌러 보고 나서야
                안 된다고 알게 되면, 그 화면은 매번 시험해 봐야 하는 화면이 된다.
              */}
              <td className={styles.actionCell}>
                {row.status === 'unassigned' && isAdmin && (
                  <>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => onAction(row, 'assign_dept')}
                    >
                      지사 지정
                    </button>
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      onClick={() => onAction(row, 'return')}
                    >
                      반려
                    </button>
                  </>
                )}

                {(row.status === 'branch' || row.status === 'agent') && canAssignAgent && (
                  <button
                    type="button"
                    className={styles.actionBtn}
                    onClick={() => onAction(row, 'assign_agent')}
                  >
                    {row.agent_name ? '설계사 변경' : '설계사 지정'}
                  </button>
                )}

                {(row.status === 'branch' || row.status === 'agent') && (
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => onAction(row, 'handle')}
                  >
                    처리 내용
                  </button>
                )}

                {row.status === 'done' && <span className={styles.muted}>완료</span>}
                {row.status === 'returned' && <span className={styles.muted}>-</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default ComplaintTable;
