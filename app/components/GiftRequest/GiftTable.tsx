'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import {
  GIFT_STATUS_LABEL,
  canDeleteGiftRequest,
  canEditGiftRequest,
  type GiftRequestRow,
} from '@/lib/gifts';
import styles from './GiftRequest.module.css';

/**
 * 사은품 신청 목록.
 *
 * 두 화면(신청·관리)이 같은 표를 쓴다. 다른 것은 **무엇을 할 수 있는가**뿐이라
 * 그것만 밖에서 받는다 — 표를 둘로 나누면 열이 어긋나기 시작한다.
 *
 * 훑을 때 필요한 것만 둔다: 언제 누가 넣었나, 누구에게 무엇을 보내나, 어디까지
 * 갔나. 열여덟 열은 [상세]에 있다.
 */

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
        <span className={`${styles.sortIcon} ${sortBy === column ? '' : styles.sortIconIdle}`}>
          {sortBy === column && sortOrder === 'desc' ? <MdArrowDropDown /> : <MdArrowDropUp />}
        </span>
      </div>
    </th>
  );
});

/** 이 표를 보는 사람이 할 수 있는 일. 화면이 정하고 표는 그대로 따른다. */
export interface GiftTableActions {
  /** 골라서 전달하는 자리. 지사만. 없으면 체크 칸이 안 나온다. */
  select?: { picked: Set<number>; onToggle: (id: number) => void; onToggleAll: (ids: number[]) => void };
  onOpen: (row: GiftRequestRow) => void;
  onEdit?: (row: GiftRequestRow) => void;
  onDelete?: (row: GiftRequestRow) => void;
  /** 사은품담당자: 발주·보완. */
  onShip?: (row: GiftRequestRow) => void;
  onSupplement?: (row: GiftRequestRow) => void;
}

interface GiftTableProps {
  rows: GiftRequestRow[];
  /** 소속 열을 보이는가. 지사·설계사는 자기 소속뿐이라 필요 없다. */
  showGroup: boolean;
  actions: GiftTableActions;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
}

const GiftTable = memo(function GiftTableComponent({
  rows,
  showGroup,
  actions,
  sortBy,
  sortOrder,
  onSort,
}: GiftTableProps) {
  const sortProps = { sortBy, sortOrder, onSort };
  const select = actions.select;
  // 전달할 수 있는 것만 골라진다. 이미 간 것에 체크 칸을 내면 눌러도 안 간다.
  const selectable = rows.filter((r) => r.status === 'requested').map((r) => r.id);
  const allPicked = selectable.length > 0 && selectable.every((id) => select?.picked.has(id));

  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            {select && (
              <th className={styles.checkCell}>
                <input
                  type="checkbox"
                  checked={allPicked}
                  onChange={() => select.onToggleAll(selectable)}
                  aria-label="전체 선택"
                  disabled={selectable.length === 0}
                />
              </th>
            )}
            <SortableHeader label="신청일" column="created_at" {...sortProps} />
            <SortableHeader label="고객명" column="customer_name" {...sortProps} />
            <th>전화번호</th>
            <SortableHeader label="사은품" column="gift_name" {...sortProps} />
            <th>수량</th>
            <SortableHeader label="주문번호" column="order_no" {...sortProps} />
            {showGroup && <SortableHeader label="지사" column="group_name" {...sortProps} />}
            <SortableHeader label="신청자" column="requester_name" {...sortProps} />
            <SortableHeader label="발주일" column="order_date" {...sortProps} />
            <SortableHeader label="상태" column="status" {...sortProps} />
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {select && (
                <td className={styles.checkCell}>
                  {row.status === 'requested' && (
                    <input
                      type="checkbox"
                      checked={select.picked.has(row.id)}
                      onChange={() => select.onToggle(row.id)}
                      aria-label={`${row.customer_name} 선택`}
                    />
                  )}
                </td>
              )}
              <td>{dateText(row.created_at)}</td>
              <td>{row.customer_name}</td>
              <td>{row.phone1 || '-'}</td>
              <td>{row.gift_name}</td>
              <td>{row.quantity}</td>
              <td>{row.order_no}</td>
              {showGroup && <td>{row.group_name}</td>}
              <td>{row.requester_name}</td>
              <td>{dateText(row.order_date)}</td>
              <td>
                <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
                  {GIFT_STATUS_LABEL[row.status]}
                </span>
                {/* 보완 사유는 목록에서 바로 보여야 한다. 상세를 열어야 알면 늦다. */}
                {row.status === 'supplement' && row.supplement_reason && (
                  <div className={styles.supplementNote} title={row.supplement_reason}>
                    {row.supplement_reason}
                  </div>
                )}
              </td>
              <td className={styles.actionCell}>
                <button type="button" className={styles.ghostBtn} onClick={() => actions.onOpen(row)}>
                  상세
                </button>
                {actions.onEdit && canEditGiftRequest(row) && (
                  <button type="button" className={styles.ghostBtn} onClick={() => actions.onEdit!(row)}>
                    {row.status === 'supplement' ? '보완' : '수정'}
                  </button>
                )}
                {actions.onDelete && canDeleteGiftRequest(row) && (
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => actions.onDelete!(row)}
                  >
                    삭제
                  </button>
                )}
                {actions.onShip && (row.status === 'forwarded' || row.status === 'shipped') && (
                  <button type="button" className={styles.actionBtn} onClick={() => actions.onShip!(row)}>
                    {row.status === 'shipped' ? '배송 수정' : '발주'}
                  </button>
                )}
                {actions.onSupplement && row.status === 'forwarded' && (
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => actions.onSupplement!(row)}
                  >
                    보완 요청
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

export default GiftTable;
