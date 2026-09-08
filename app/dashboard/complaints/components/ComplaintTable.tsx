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
 * '확인' 열은 없다. 상세를 여는 것이 곧 확인이라 아무도 거기서 할 일이 없고,
 * 이미 본 줄은 가라앉아(rowRead) 안 본 것과 갈린다. 누가 언제 봤는지는 상세에 있다.
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
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const days = daysSince(row.created_at);
            const overdue = isOverdueComplaint(row);
            const open = row.status === 'branch';
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

                {/*
                  상태와 '확인함'을 한 칸에 위아래로 둔다.
                  확인은 상태가 아니라 상태에 딸린 사실이다 — 확인해도 아직
                  미처리이고, 열을 따로 세우면 그 둘이 다른 일처럼 보인다.
                  줄이 회색으로 가라앉는 것만으로는 "본 것"인지 알기 어려워
                  글자로도 적어 둔다.
                */}
                <td>
                  <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
                    {COMPLAINT_STATUS_LABEL[row.status]}
                  </span>
                  {row.status === 'branch' && (
                    <span
                      className={`${styles.statusBadge} ${styles.readBadge} ${row.read_at ? styles.read_yes : styles.read_no}`}
                      title={row.read_at ? `${dateText(row.read_at)} 확인` : undefined}
                    >
                      {row.read_at ? '확인' : '미확인'}
                    </span>
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

                  {/*
                    관리자: 못 찾은 건은 지사를 정하고, 이미 간 건은 옮긴다. 둘 다 보완 요청도 된다.
                    지사: 처리하거나, 우리 건이 아니면 관리자에게 되돌린다.
                    끝난 건·닫힌 건·보완 중인 건에는 아무 버튼도 없다 — 서버도 안 받는다.
                  */}
                  {isAdmin && (row.status === 'unassigned' || open) && (
                    <>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => onAction(row, 'assign_dept')}
                      >
                        {row.status === 'unassigned' ? '지사 지정' : '지사 옮기기'}
                      </button>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => onAction(row, 'return')}
                      >
                        보완 요청
                      </button>
                    </>
                  )}

                  {open && (
                    <>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => onAction(row, 'handle')}
                      >
                        처리 내용
                      </button>
                      {!isAdmin && (
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => onAction(row, 'bounce')}
                        >
                          우리 지사 건 아님
                        </button>
                      )}
                    </>
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
