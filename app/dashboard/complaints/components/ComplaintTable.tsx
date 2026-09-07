'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import {
  COMPLAINT_STATUS_LABEL,
  daysSince,
  isOverdueComplaint,
  type ComplaintRow,
} from '@/lib/complaints';
import type { ActionKind } from './ComplaintActionModal';
import styles from '../page.module.css';

/**
 * 민원 목록.
 *
 * 훑을 때 필요한 것만 둔다 — 언제 들어왔나, 누구 건인가, 무슨 내용인가,
 * 지금 어디까지 됐나, 무엇을 해야 하나. 한 칸에 한 값이라 줄이 흔들리지 않는다.
 *
 * 나머지(상품·발주확인일·통화일시·올린 사람·배정 근거·처리 이력)는 [상세]에 있다.
 * 목록에 다 넣으려다 칸이 서로 밀어내 겹치고 잘렸다 — 값을 감춘 게 아니라
 * 볼 자리를 옮긴 것이다.
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
  /** 지사·설계사가 '봤다'고 남긴다. 관리자도 대신 눌러 줄 수 있다. */
  onRead: (row: ComplaintRow) => void;
  /** 목록에 없는 값까지 다 보여주는 창을 연다. */
  onOpen: (row: ComplaintRow) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onAction: (row: ComplaintRow, kind: ActionKind) => void;
}

const ComplaintTable = memo(function ComplaintTableComponent({
  rows,
  isAdmin,
  onRead,
  onOpen,
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
            <SortableHeader label="민원 등록일" column="created_at" {...sortProps} />
            <th>경과</th>
            <SortableHeader label="수령인" column="customer_name" {...sortProps} />
            <SortableHeader label="전화번호" column="phone" {...sortProps} />
            <SortableHeader label="주문번호" column="order_no" {...sortProps} />
            {/* 통화내역은 자유롭게 적는 글이라 글자순으로 세워도 의미가 없다. */}
            <th>통화내역</th>
            {isAdmin && <SortableHeader label="담당 지사" column="assigned_group" {...sortProps} />}
            <SortableHeader label="상태" column="status" {...sortProps} />
            <SortableHeader label="확인" column="read_at" {...sortProps} />
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const days = daysSince(row.created_at);
            const overdue = isOverdueComplaint(row);
            const open = row.status === 'branch' || row.status === 'agent';
            /*
             * 같은 건으로 또 들어온 민원. 아직 안 끝난 묶음만 붉게 칠한다 —
             * 다 끝난 것까지 붉으면 목록이 점점 붉어져 색이 뜻을 잃는다.
             */
            const repeated = (row.thread_total ?? 1) > 1;
            const alarming = repeated && row.thread_open;

            return (
              <tr
                key={row.id}
                className={`${row.read_at ? styles.rowRead : ''} ${alarming ? styles.rowRepeat : ''}`}
              >
                <td>
                  {dateText(row.created_at)}
                  {/* 몇 번째로 들어온 건인지. 1차만 있는 건에는 붙이지 않는다. */}
                  {repeated && (
                    <span className={styles.threadBadge} title={`같은 건으로 ${row.thread_total}번 접수`}>
                      {row.sequence_no}차
                    </span>
                  )}
                </td>

                {/* 3일 넘게 안 된 건은 붉게. 목록에서 이 색만 좇으면 밀린 건이 보인다. */}
                <td className={overdue ? styles.overdueCell : ''}>
                  {days === 0 ? '오늘' : `${days}일`}
                </td>

                <td>{row.customer_name}</td>
                <td>{row.phone || '-'}</td>
                <td>{row.order_no || '-'}</td>

                {/* 길이를 예측할 수 없다. 한 줄로 잘라 두고 전체는 상세에서 본다. */}
                <td className={styles.memoCell} title={row.call_memo || ''}>
                  {row.call_memo || '-'}
                </td>

                {isAdmin && <td>{row.assigned_group || <span className={styles.muted}>미정</span>}</td>}

                <td>
                  <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
                    {COMPLAINT_STATUS_LABEL[row.status]}
                  </span>
                </td>

                {/*
                  봤는지 아닌지. 관리자는 이걸로 "아예 못 본 건"과 "보고도 안 하는 건"을 가른다.
                  누가 언제 봤는지는 상세에 있다.
                */}
                <td>
                  {row.read_at ? (
                    <span className={styles.readBadge}>확인</span>
                  ) : open ? (
                    // 이 칸을 눌러 확인 처리한다. 상태가 곧 버튼이라 어디를 눌러야
                    // 하는지 따로 찾을 필요가 없다.
                    <button type="button" className={styles.unreadBtn} onClick={() => onRead(row)}>
                      미확인
                    </button>
                  ) : (
                    <span className={styles.muted}>-</span>
                  )}
                </td>

                {/*
                  할 수 있는 것만 버튼으로 낸다. 못 하는 동작을 눌러 보고 나서야
                  안 된다고 알게 되면, 그 화면은 매번 시험해 봐야 하는 화면이 된다.
                */}
                <td className={styles.actionCell}>
                  <button type="button" className={styles.ghostBtn} onClick={() => onOpen(row)}>
                    상세
                  </button>

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

                  {open && (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => onAction(row, 'handle')}
                    >
                      처리 내용
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export default ComplaintTable;
