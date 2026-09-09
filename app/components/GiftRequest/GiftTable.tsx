'use client';

import React, { Fragment, memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import {
  GIFT_STATUS_LABEL,
  canDeleteGiftRequest,
  canEditGiftRequest,
  canShipGiftRequest,
  canWithdrawGiftRequest,
  daysSince,
  isOverdueGiftRequest,
  waitingSince,
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

const dateTimeText = (value: string | null) => {
  if (!value) return '-';
  const at = new Date(value);
  return `${at.toLocaleDateString('ko-KR').slice(0, -1)} ${at.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
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
        <span className={`${styles.sortIcon} ${sortBy === column ? '' : styles.sortIconIdle}`}>
          {sortBy === column && sortOrder === 'desc' ? <MdArrowDropDown /> : <MdArrowDropUp />}
        </span>
      </div>
    </th>
  );
});

/** 이 표를 보는 사람이 할 수 있는 일. 화면이 정하고 표는 그대로 따른다. */
export interface GiftTableActions {
  /**
   * 골라서 한 번에 넘기는 자리. 지사는 전달할 것을, 담당자는 발주할 것을 고른다.
   * 어느 상태를 고를 수 있는지는 화면이 정한다(selectable).
   */
  select?: {
    picked: Set<number>;
    selectable: (row: GiftRequestRow) => boolean;
    onToggle: (id: number) => void;
    onToggleAll: (ids: number[]) => void;
  };
  /**
   * 상세 열기. **여는 것이 곧 확인이다** — 담당자가 발주 대기 건을 열면 확인이
   * 찍히고(지사는 그 뒤로 못 고친다), 지사가 배송 정보 입력됨 건을 열면 송장을
   * 봤다고 찍힌다. 확인 버튼은 따로 없다. 화면이 여기서 그 처리를 한다.
   */
  onOpen: (row: GiftRequestRow) => void;
  onEdit?: (row: GiftRequestRow) => void;
  onDelete?: (row: GiftRequestRow) => void;
  onWithdraw?: (row: GiftRequestRow) => void;
  /** 사은품담당자: 배송 정보·보완. */
  onShip?: (row: GiftRequestRow) => void;
  onSupplement?: (row: GiftRequestRow) => void;
  /** 관리자: 기록 없이 들어온 건을 확인한다. */
  onCheck?: (row: GiftRequestRow) => void;
  /** 담당자: 그 건이 실린 발주리스트 엑셀을 다시 받는다. */
  onDownloadOrder?: (orderId: number) => void;
}

interface GiftTableProps {
  rows: GiftRequestRow[];
  /** 소속 열을 보이는가. 지사는 자기 소속뿐이라 필요 없다. */
  showGroup: boolean;
  /** 관리자(admin·subadmin)인가. 관리자는 상태와 무관하게 지울 수 있다. */
  isAdmin?: boolean;
  actions: GiftTableActions;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
}

const GiftTable = memo(function GiftTableComponent({
  rows,
  showGroup,
  isAdmin = false,
  actions,
  sortBy,
  sortOrder,
  onSort,
}: GiftTableProps) {
  const sortProps = { sortBy, sortOrder, onSort };
  const select = actions.select;
  const selectableIds = select ? rows.filter(select.selectable).map((r) => r.id) : [];
  const allPicked = selectableIds.length > 0 && selectableIds.every((id) => select?.picked.has(id));

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
                  onChange={() => select.onToggleAll(selectableIds)}
                  aria-label="전체 선택"
                  disabled={selectableIds.length === 0}
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
          {rows.map((row) => {
            /*
              사흘 넘게 그 자리에 서 있는 건. 아직 누군가 손대야 하는 자리만
              센다 — 다 끝난 줄까지 붉으면 색이 뜻을 잃는다.
            */
            const overdue = isOverdueGiftRequest(row);
            const waiting = daysSince(waitingSince(row));
            return (
              <Fragment key={row.id}>
                <tr className={overdue ? styles.rowOverdue : ''}>
                  {select && (
                    <td className={styles.checkCell}>
                      {select.selectable(row) && (
                        <input
                          type="checkbox"
                          checked={select.picked.has(row.id)}
                          onChange={() => select.onToggle(row.id)}
                          aria-label={`${row.customer_name} 선택`}
                        />
                      )}
                    </td>
                  )}
                  <td className={overdue ? styles.overdueCell : ''} title={overdue ? `${waiting}일째 이 자리에 있습니다` : undefined}>
                    {dateText(row.created_at)}
                    {overdue && <span className={styles.overdueTag}>{waiting}일</span>}
                  </td>
                  <td>{row.customer_name}</td>
                  <td>{row.phone1 || '-'}</td>
                  <td>{row.gift_name}</td>
                  <td>{row.quantity}</td>
                  <td>{row.order_no}</td>
                  {showGroup && <td>{row.group_name}</td>}
                  <td>{row.requester_name}</td>
                  <td>
                    {dateText(row.order_date)}
                    {/*
                      어느 발주리스트에 실렸나. 담당자에게는 누르면 그 장의 엑셀이 다시
                      내려온다 — 메일을 못 찾거나 거래처가 다시 달라고 할 때.
                    */}
                    {row.order_id &&
                      (actions.onDownloadOrder ? (
                        <button
                          type="button"
                          className={styles.orderTagBtn}
                          onClick={() => actions.onDownloadOrder!(row.order_id!)}
                          title="이 발주리스트 엑셀 다시 받기"
                        >
                          #{row.order_id}
                        </button>
                      ) : (
                        <span className={styles.orderTag}>#{row.order_id}</span>
                      ))}
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
                      {GIFT_STATUS_LABEL[row.status]}
                    </span>
                    {/*
                      담당자가 봤는가. 지사는 이걸로 "아직 고칠 수 있다"를 알고,
                      담당자는 아직 안 연 건을 안다. 상세를 열면 '확인'으로 바뀐다.
                    */}
                    {row.status === 'forwarded' && (
                      <span
                        className={`${styles.statusBadge} ${styles.readBadge} ${row.read_at ? styles.read_yes : styles.read_no}`}
                        title={
                          row.read_at
                            ? `담당자 확인 ${dateText(row.read_at)}`
                            : '담당자가 아직 열지 않음 — 지사가 고칠 수 있음'
                        }
                      >
                        {row.read_at ? '확인' : '미확인'}
                      </span>
                    )}
                    {/* 채워진 송장을 지사가 봤는가. 안 봤으면 그 줄이 아직 지사의 할 일이다. */}
                    {row.status === 'shipped' && (
                      <span
                        className={`${styles.statusBadge} ${styles.readBadge} ${row.ship_read_at ? styles.read_yes : styles.read_no}`}
                        title={
                          row.ship_read_at
                            ? `지사 확인 ${dateText(row.ship_read_at)}`
                            : '지사가 아직 열지 않음'
                        }
                      >
                        {row.ship_read_at ? '확인' : '미확인'}
                      </span>
                    )}
                    {/* 보완 사유는 목록에서 바로 보여야 한다. 상세를 열어야 알면 늦다. */}
                    {row.status === 'supplement' && row.supplement_reason && (
                      <div className={styles.supplementNote} title={row.supplement_reason}>
                        {row.supplement_reason}
                      </div>
                    )}
                    {/* 송장이 채워졌으면 그 자리에서 보인다 — 지사가 "업데이트됐다"를 여기서 안다. */}
                    {row.status === 'shipped' && (
                      <div className={styles.shipNote}>
                        {[row.courier, row.tracking_no].filter(Boolean).join(' · ')}
                      </div>
                    )}
                    {/* 재신청 사유. 확인 대기 줄에서 바로 읽혀야 한다. */}
                    {row.status === 'pending_check' && row.check_reason && (
                      <div className={styles.supplementNote} title={row.check_reason}>
                        재신청: {row.check_reason}
                      </div>
                    )}
                    {/* 확인을 받고 지나온 건. 어느 관리자가 통과시켰는지가 줄에 남는다. */}
                    {row.checked_at && row.status !== 'pending_check' && (
                      <div className={styles.checkedNote}>관리자 확인 {row.checked_by}</div>
                    )}
                  </td>
                  <td className={styles.actionCell}>
                    <button type="button" className={styles.ghostBtn} onClick={() => actions.onOpen(row)}>
                      상세
                    </button>
                    {actions.onEdit && canEditGiftRequest(row) && (
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => actions.onEdit!(row)}
                        title={
                          row.status === 'forwarded'
                            ? '담당자가 아직 확인하지 않아 고칠 수 있습니다'
                            : undefined
                        }
                      >
                        {row.status === 'supplement' ? '보완' : '수정'}
                      </button>
                    )}
                    {actions.onWithdraw && canWithdrawGiftRequest(row) && (
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => actions.onWithdraw!(row)}
                      >
                        철회
                      </button>
                    )}
                    {actions.onDelete && canDeleteGiftRequest(row, isAdmin) && (
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => actions.onDelete!(row)}
                      >
                        삭제
                      </button>
                    )}
                    {actions.onCheck && row.status === 'pending_check' && (
                      <button
                        type="button"
                        className={styles.unreadBtn}
                        onClick={() => actions.onCheck!(row)}
                        title="같은 주문번호로 들어온 신청을 함께 보고 확인합니다"
                      >
                        확인
                      </button>
                    )}
                    {actions.onSupplement && row.status === 'pending_check' && (
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => actions.onSupplement!(row)}
                      >
                        보완 요청
                      </button>
                    )}
                    {/*
                      배송 정보는 한 번만 적는다. 운송장번호가 나왔다는 것은 이미
                      발송했다는 뜻이라, 채워진 뒤에는 고치는 버튼을 내지 않는다.
                    */}
                    {actions.onShip && canShipGiftRequest(row) && (
                      <button type="button" className={styles.actionBtn} onClick={() => actions.onShip!(row)}>
                        배송 정보
                      </button>
                    )}
                    {actions.onSupplement && (row.status === 'forwarded' || row.status === 'ordered') && (
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
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export default GiftTable;
