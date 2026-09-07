'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import {
  canDeleteComplaint,
  canEditComplaint,
  type ComplaintRow,
  type ComplaintStatus,
} from '@/lib/complaints';
import styles from '../page.module.css';

/**
 * 내가 넣은 민원.
 *
 * 훑을 때 필요한 것만 둔다 — 언제 넣었나, 누구 건인가, 무슨 내용인가,
 * 지금 어디까지 됐나. 한 칸에 한 값이라 줄이 흔들리지 않는다.
 *
 * 나머지(상품·발주확인일·통화일시·처리 내용·전달 경위)는 [상세]에 있다.
 * 민원 화면과 같은 방식으로 둔다 — 두 화면이 다르게 생기면 같은 일을 두 번 익혀야 한다.
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

interface RegisteredTableProps {
  rows: ComplaintRow[];
  statusLabel: Record<ComplaintStatus, string>;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onOpen: (row: ComplaintRow) => void;
  onEdit: (row: ComplaintRow) => void;
  onDelete: (row: ComplaintRow) => void;
}

const RegisteredTable = memo(function RegisteredTableComponent({
  rows,
  statusLabel,
  sortBy,
  sortOrder,
  onSort,
  onOpen,
  onEdit,
  onDelete,
}: RegisteredTableProps) {
  const sortProps = { sortBy, sortOrder, onSort };

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            {/* 우리에게 들어온 날. 고객이 신청한 날(고객 접수일)과 헷갈리지 않게 이름을 다르게 둔다. */}
            <SortableHeader label="민원 등록일" column="created_at" {...sortProps} />
            <SortableHeader label="수령인" column="customer_name" {...sortProps} />
            <SortableHeader label="전화번호" column="phone" {...sortProps} />
            <SortableHeader label="주문번호" column="order_no" {...sortProps} />
            <SortableHeader label="고객 접수일" column="received_at" {...sortProps} />
            {/* 통화내역은 자유롭게 적는 글이라 글자순으로 세워도 의미가 없다. */}
            <th>통화내역</th>
            <SortableHeader label="상태" column="status" {...sortProps} />
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{dateText(row.created_at)}</td>
              <td>{row.customer_name}</td>
              <td>{row.phone || '-'}</td>
              <td>{row.order_no || '-'}</td>
              <td>{dateText(row.received_at)}</td>

              {/* 길이를 예측할 수 없다. 한 줄로 잘라 두고 전체는 상세에서 본다. */}
              <td className={styles.noteCell} title={row.call_memo || ''}>
                {row.call_memo || '-'}
              </td>

              <td>
                <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
                  {statusLabel[row.status]}
                </span>
              </td>

              {/*
                누군가 손댄 뒤에는 고치기·지우기 버튼을 아예 내지 않는다. 눌러 보고
                나서 "안 된다"는 말을 듣는 것보다 비어 있는 편이 낫다. 왜 못 하는지는
                바로 옆 상태 칸이 말하고 있다.

                반려된 건은 둘이 갈린다 — 고치기는 되고 지우기는 안 된다.
              */}
              <td className={styles.actionCell}>
                <button type="button" className={styles.ghostBtn} onClick={() => onOpen(row)}>
                  상세
                </button>
                {canEditComplaint(row) && (
                  <button type="button" className={styles.ghostBtn} onClick={() => onEdit(row)}>
                    수정
                  </button>
                )}
                {/*
                  반려된 건은 고치기만 되고 지우기는 안 된다. 지우면 반려 이력까지
                  함께 사라져, 되돌려 보낸 사유가 통째로 없어진다.
                */}
                {canDeleteComplaint(row) && (
                  <button type="button" className={styles.dangerBtn} onClick={() => onDelete(row)}>
                    삭제
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

export default RegisteredTable;
