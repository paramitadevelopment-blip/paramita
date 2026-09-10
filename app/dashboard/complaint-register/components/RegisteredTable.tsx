'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import {
  canDeleteComplaint,
  canEditComplaint,
  canWithdrawComplaint,
  type ComplaintRow,
  type ComplaintStatus,
} from '@/lib/complaints';
import styles from '../page.module.css';

/**
 * 사무실에서 넣은 민원.
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
  /**
   * 담당 지사 열을 내는가.
   *
   * 넣은 사람(민원담당자)에게는 안 낸다 — 어느 지사가 받았는지는 그다음 사정이고,
   * 배정이 안 된 건은 관리자가 정한다. 관리자에게는 이 화면에서도 보여야 한다:
   * 여기가 "들어온 민원 전부"가 모이는 자리라, 어디로 갔는지 한눈에 봐야 한다.
   */
  statusLabel: Record<ComplaintStatus, string>;
  /** 관리자는 상태와 무관하게 지울 수 있다. 버튼을 낼지 여기서 갈린다. */
  isAdmin: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onOpen: (row: ComplaintRow) => void;
  onEdit: (row: ComplaintRow) => void;
  onDelete: (row: ComplaintRow) => void;
  /** 보완 요청을 받은 건을 진행하지 않기로 닫는다. 지우는 것과 다르다. */
  onWithdraw: (row: ComplaintRow) => void;
}

const RegisteredTable = memo(function RegisteredTableComponent({
  rows,
  statusLabel,
  isAdmin,
  sortBy,
  sortOrder,
  onSort,
  onOpen,
  onEdit,
  onDelete,
  onWithdraw,
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
            <SortableHeader label="담당 지사" column="assigned_group" {...sortProps} />
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
              {/* 배정 못 한 건은 빈칸이 아니라 '미정'이다. 관리자가 손봐야 할 자리다. */}
              <td>
                {row.assigned_group || <span className={styles.muted}>미정</span>}
              </td>

              {/* 길이를 예측할 수 없다. 한 줄로 잘라 두고 전체는 상세에서 본다. */}
              <td className={styles.noteCell} title={row.call_memo || ''}>
                {row.call_memo || '-'}
              </td>

              {/*
                상태 옆에 지사가 봤는지를 붙인다.
                넣은 사람에게는 이게 곧 "아직 고칠 수 있나"다 — 지사가 여는 순간
                수정·삭제 버튼이 사라지므로, 사라진 뒤에 왜인지 찾게 두면 안 된다.
              */}
              <td>
                <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
                  {statusLabel[row.status]}
                </span>
                {row.status === 'branch' && (
                  <span
                    className={`${styles.statusBadge} ${styles.readBadge} ${row.read_at ? styles.read_yes : styles.read_no}`}
                    title={
                      row.read_at
                        ? `${dateText(row.read_at)} 지사 확인 — 이제 수정할 수 없습니다`
                        : '지사 확인 전 — 지금은 수정할 수 있습니다'
                    }
                  >
                    {row.read_at ? '확인' : '미확인'}
                  </span>
                )}
              </td>

              {/*
                누군가 손댄 뒤에는 고치기·지우기 버튼을 아예 내지 않는다. 눌러 보고
                나서 "안 된다"는 말을 듣는 것보다 비어 있는 편이 낫다. 왜 못 하는지는
                바로 옆 상태 칸이 말하고 있다.

                보완 요청을 받은 건은 갈린다 — 고쳐서 다시 보내거나 철회한다.
                지우지는 못한다: 지우면 보완 이력까지 사라진다.
              */}
              <td className={styles.actionCell}>
                <button type="button" className={styles.ghostBtn} onClick={() => onOpen(row)}>
                  상세
                </button>
                {canEditComplaint(row) && (
                  <button type="button" className={styles.ghostBtn} onClick={() => onEdit(row)}>
                    {row.status === 'returned' ? '보완' : '수정'}
                  </button>
                )}
                {canWithdrawComplaint(row) && (
                  <button type="button" className={styles.ghostBtn} onClick={() => onWithdraw(row)}>
                    철회
                  </button>
                )}
                {canDeleteComplaint(row, isAdmin) && (
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
