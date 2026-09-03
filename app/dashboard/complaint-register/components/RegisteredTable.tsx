'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { isUntouchedComplaint, type ComplaintRow, type ComplaintStatus } from '@/lib/complaints';
import styles from '../page.module.css';

/**
 * 내가 넣은 민원.
 *
 * 이 화면은 **넘긴 원본을 그대로 보여주는 자리**다. 열 순서도 메일에 오는 표와
 * 같게 둔다 — 옮겨 적은 것이 맞는지 대조하는 데 쓰이므로, 순서가 다르면 눈이
 * 계속 왔다 갔다 한다.
 *
 * 담당 지사와 처리 내용은 여기 두지 않는다. 그건 받은 쪽이 무엇을 했는지에
 * 대한 것이고 민원 화면에 있다. 넣은 사람에게 필요한 건 "내가 넘긴 것이
 * 무엇이었나"와 "지금 어디까지 갔나" 둘이다.
 */

/* 'ko-KR'은 끝에 점을 붙인다('2026. 9. 3.'). 다른 화면과 같이 그 점만 뗀다. */
const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('ko-KR').slice(0, -1) : '-';

/** 통화일시는 몇 시에 통화했는지가 내용의 일부라 시각까지 보여준다. */
const dateTimeText = (value: string | null) => {
  if (!value) return '-';
  const at = new Date(value);
  const time = at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return `${at.toLocaleDateString('ko-KR').slice(0, -1)} ${time}`;
};

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
  onEdit: (row: ComplaintRow) => void;
  onDelete: (row: ComplaintRow) => void;
}

const RegisteredTable = memo(function RegisteredTableComponent({
  rows,
  statusLabel,
  sortBy,
  sortOrder,
  onSort,
  onEdit,
  onDelete,
}: RegisteredTableProps) {
  const sortProps = { sortBy, sortOrder, onSort };

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          {/* 메일의 표 순서 그대로. 앞에 등록일, 뒤에 상태와 할 일만 붙인다. */}
          <tr>
            <SortableHeader label="등록일" column="created_at" {...sortProps} />
            <th>주문 대표상품</th>
            <SortableHeader label="수령인" column="customer_name" {...sortProps} />
            <SortableHeader label="전화번호" column="phone" {...sortProps} />
            <SortableHeader label="접수일자" column="received_at" {...sortProps} />
            <th>발주확인일</th>
            <th>통화내역</th>
            <SortableHeader label="주문번호" column="order_no" {...sortProps} />
            <SortableHeader label="통화일시" column="called_at" {...sortProps} />
            <SortableHeader label="상태" column="status" {...sortProps} />
            <th>할 일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{dateText(row.created_at)}</td>
              <td className={styles.productCell} title={row.product || ''}>
                {row.product || '-'}
              </td>
              <td>{row.customer_name}</td>
              <td>{row.phone || '-'}</td>
              <td>{dateText(row.received_at)}</td>
              <td>{dateText(row.order_confirmed_at)}</td>
              <td className={styles.noteCell} title={row.call_memo || ''}>
                {row.call_memo || '-'}
              </td>
              <td>{row.order_no || '-'}</td>
              <td>{dateTimeText(row.called_at)}</td>

              <td>
                <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
                  {statusLabel[row.status]}
                </span>
                {/*
                  반려 사유만은 여기 남긴다. 처리 내용과 달리 넣은 사람에게 하는
                  말이라, 이걸 안 보여주면 무엇을 고쳐야 할지 알 수가 없다.
                */}
                {row.status === 'returned' && row.return_reason && (
                  <span className={styles.returnReason} title={row.return_reason}>
                    {row.return_reason}
                  </span>
                )}
              </td>

              {/*
                누군가 손댄 뒤에는 버튼을 아예 내지 않는다. 눌러 보고 나서
                "안 된다"는 말을 듣는 것보다, 왜 못 하는지가 보이는 편이 낫다.
              */}
              <td className={styles.actionCell}>
                {isUntouchedComplaint(row) ? (
                  <>
                    <button type="button" className={styles.ghostBtn} onClick={() => onEdit(row)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className={styles.dangerBtn}
                      onClick={() => onDelete(row)}
                    >
                      삭제
                    </button>
                  </>
                ) : (
                  <span className={styles.muted}>처리 중</span>
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
