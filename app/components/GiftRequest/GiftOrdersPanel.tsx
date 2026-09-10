'use client';

import React, { memo, useState } from 'react';
import {
  MdArrowBack,
  MdArrowDropDown,
  MdArrowDropUp,
  MdDownload,
  MdExpandMore,
  MdOutlineInventory,
} from 'react-icons/md';
import { useGiftOrders, useGiftOrder, type GiftOrderSummary } from '@/app/hooks/useGifts';
import { GIFT_STATUS_LABEL, type GiftRequestRow } from '@/lib/gifts';
import { compareValues, rowMatches } from '@/lib/listSearch';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import Pagination from '@/app/components/Pagination/Pagination';
import GiftTable from './GiftTable';
import styles from './GiftRequest.module.css';

/**
 * 발주리스트 — 거래처에 보낸 장 하나하나.
 *
 * 담당자가 [발주리스트 만들기]를 누를 때마다 한 줄이 생긴다. 그 장에 무엇이
 * 실렸고 지금 어디까지 갔는지가 여기서 읽힌다. 엑셀을 다시 받거나 건별로
 * 배송 정보를 적는 것도 여기서 한다 — 송장은 대개 장 단위로 한꺼번에 온다.
 *
 * 장 목록도 장 안의 건도 이미 다 받아 둔 것이라, 거르고 세우고 나누는 일을
 * 전부 그 자리에서 한다. 서버에 다시 묻지 않는다.
 */

const dateTimeText = (value: string | null) => {
  if (!value) return '-';
  const at = new Date(value);
  return `${at.toLocaleDateString('ko-KR').slice(0, -1)} ${at.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const PAGE_SIZES = [10, 20, 30, 50] as const;

/** 장 목록에서 세울 수 있는 것. 표의 열과 하나씩 짝이 맞는다. */
type OrderSort = 'id' | 'created_at' | 'count' | 'shipped' | 'groups' | 'created_by';

/**
 * 한 장에서 세울 수 있는 것.
 *
 * GiftTable이 머리글로 내주는 여덟 개와 하나씩 맞춘다 — 눌러도 아무 일이
 * 없는 머리글이 하나라도 있으면 나머지도 안 눌러 보게 된다.
 */
const ITEM_SORTS = [
  'created_at',
  'customer_name',
  'gift_name',
  'order_no',
  'group_name',
  'requester_name',
  'order_date',
  'status',
] as const;
type ItemSort = (typeof ITEM_SORTS)[number];

interface GiftOrdersPanelProps {
  /** 방금 만든 장. 있으면 그 장을 바로 연다. */
  initialOrderId?: number | null;
  onOpenRow: (row: GiftRequestRow) => void;
  onShip: (row: GiftRequestRow) => void;
  onDownload: (orderId: number) => Promise<void>;
}

const GiftOrdersPanel = memo(function GiftOrdersPanelComponent({
  initialOrderId = null,
  onOpenRow,
  onShip,
  onDownload,
}: GiftOrdersPanelProps) {
  const orders = useGiftOrders();
  const [openId, setOpenId] = useState<number | null>(initialOrderId);
  const detail = useGiftOrder(openId);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(10);
  const [downloading, setDownloading] = useState<number | null>(null);
  /*
   * 장 목록도, 장 안의 건도 이미 다 받아 둔 것이라 그 자리에서 거른다.
   * 검색칸이 없으면 장이 쌓인 뒤에는 눈으로 훑는 수밖에 없다.
   */
  const [search, setSearch] = useState('');
  // 목록은 새로 만든 장이 위로 오는 게 기본이다.
  const [orderSort, setOrderSort] = useState<{ by: OrderSort; order: 'asc' | 'desc' }>({
    by: 'created_at',
    order: 'desc',
  });
  const [itemSort, setItemSort] = useState<{ by: ItemSort; order: 'asc' | 'desc' }>({
    by: 'group_name',
    order: 'asc',
  });

  /** 같은 열을 다시 누르면 방향만 뒤집는다. 다른 열이면 그 열의 기본 방향으로. */
  const toggleOrderSort = (column: string) =>
    setOrderSort((prev) =>
      prev.by === column
        ? { by: prev.by, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : // 날짜·건수는 큰 것부터, 이름은 가나다순이 사람이 기대하는 첫 방향이다.
          {
            by: column as OrderSort,
            order: ['created_at', 'count', 'shipped', 'id'].includes(column) ? 'desc' : 'asc',
          }
    );

  const toggleItemSort = (column: string) => {
    if (!(ITEM_SORTS as readonly string[]).includes(column)) return;
    setItemSort((prev) =>
      prev.by === column
        ? { by: prev.by, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { by: column as ItemSort, order: column === 'created_at' ? 'desc' : 'asc' }
    );
  };

  /*
   * 장을 열고 닫을 때는 페이지와 검색어를 되돌린다.
   *
   * 목록 3쪽에서 장을 열면 그 장의 3쪽이 열리고, 장을 거른 말이 장 안의 건에
   * 그대로 걸려 "실린 건이 없다"처럼 보인다. 다른 목록으로 넘어가는 것이니
   * 보던 자리도 함께 넘어가야 한다.
   */
  const goto = (id: number | null) => {
    setOpenId(id);
    setPage(1);
    setSearch('');
  };

  const download = async (id: number) => {
    setDownloading(id);
    try {
      await onDownload(id);
    } finally {
      setDownloading(null);
    }
  };

  /** 몇 건씩 볼지 고르는 자리. 두 화면이 같은 모양을 쓴다. */
  const perPageSelect = (
    <div className={styles.selectWrapper}>
      <select
        className={styles.select}
        value={perPage}
        onChange={(e) => {
          setPerPage(Number(e.target.value));
          setPage(1);
        }}
      >
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}개씩보기
          </option>
        ))}
      </select>
      <MdExpandMore className={styles.selectIcon} />
    </div>
  );

  /* ── 장 목록 ───────────────────────────────────────────── */
  if (!openId) {
    if (orders.isLoading) return <Spinner />;
    const every = orders.data ?? [];
    // 장 목록에 뜨는 값 — 번호·날짜·건수·송장·지사·만든 사람 — 어디든 걸리면 나온다.
    const found = every.filter((o) =>
      rowMatches({ ...o, id: `#${o.id}`, groups: o.groups.join(' ') }, search)
    );
    const sorted = [...found].sort((a, b) => {
      const pick = (o: GiftOrderSummary) =>
        orderSort.by === 'groups' ? o.groups.join(' ') : o[orderSort.by];
      // 같은 값이면 번호로 갈라 둔다 — 페이지를 넘길 때 줄이 자리를 바꾸지 않게.
      return compareValues(pick(a), pick(b), orderSort.order) || b.id - a.id;
    });
    const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
    const current = Math.min(page, totalPages);
    const shown = sorted.slice((current - 1) * perPage, current * perPage);

    const Head = ({ label, column }: { label: string; column: OrderSort }) => (
      <th className={styles.sortableHeader} onClick={() => toggleOrderSort(column)}>
        <div className={styles.headerContent}>
          <span>{label}</span>
          <span
            className={`${styles.sortIcon} ${orderSort.by === column ? '' : styles.sortIconIdle}`}
          >
            {orderSort.by === column && orderSort.order === 'desc' ? (
              <MdArrowDropDown />
            ) : (
              <MdArrowDropUp />
            )}
          </span>
        </div>
      </th>
    );

    return (
      <>
        <div className={styles.searchSection}>
          <span className={styles.totalCount}>
            총 <span>{sorted.length}</span>장
            {search && every.length !== sorted.length && (
              <span className={styles.searchNote}> / 전체 {every.length}장</span>
            )}
          </span>
          <SearchBar
            value={search}
            onChange={setSearch}
            onReset={() => setSearch('')}
            placeholder="모든 항목 검색 — 발주 번호 · 지사 · 만든 사람 · 날짜"
          />
        </div>

        <div className={styles.controlsSection}>{perPageSelect}</div>

        {every.length === 0 ? (
          <EmptyState message="아직 만든 발주리스트가 없습니다." />
        ) : sorted.length === 0 ? (
          <EmptyState message={`'${search}' 검색 결과가 없습니다.`} />
        ) : (
          <>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <Head label="발주 번호" column="id" />
                    <Head label="만든 날짜" column="created_at" />
                    <Head label="포함 건수" column="count" />
                    <Head label="송장" column="shipped" />
                    <Head label="지사" column="groups" />
                    <Head label="만든 사람" column="created_by" />
                    <th>작업</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <button type="button" className={styles.batchOpen} onClick={() => goto(o.id)}>
                          <MdOutlineInventory className={styles.batchIcon} />
                          <span className={styles.batchName}>발주 #{o.id}</span>
                        </button>
                      </td>
                      <td>{dateTimeText(o.created_at)}</td>
                      <td>
                        <span className={`${styles.batchCount} ${o.count === 0 ? styles.batchCountEmpty : ''}`}>
                          {o.count === 0 ? '비어 있음' : `${o.count}건`}
                        </span>
                      </td>
                      <td>
                        {/* 실린 수와 다르면 발주처에서 덜 받은 것이다. 눈에 띄어야 한다. */}
                        <span
                          className={
                            o.count > 0 && o.shipped < o.count ? styles.shipWaiting : styles.shipDone
                          }
                        >
                          {o.shipped} / {o.count}
                        </span>
                      </td>
                      <td>{o.groups.join(' · ') || '-'}</td>
                      <td>{o.created_by}</td>
                      <td className={styles.actionCell}>
                        <button type="button" className={styles.ghostBtn} onClick={() => goto(o.id)}>
                          열기
                        </button>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => download(o.id)}
                          disabled={downloading !== null || o.count === 0}
                          title={o.count === 0 ? '포함된 건이 없습니다' : '거래처 양식 엑셀'}
                        >
                          <MdDownload />
                          {downloading === o.id ? '만드는 중…' : '엑셀'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={current}
              totalPages={totalPages}
              onPageChange={setPage}
              isLoading={orders.isFetching}
            />
          </>
        )}
      </>
    );
  }

  /* ── 장 하나 ───────────────────────────────────────────── */
  if (detail.isLoading || !detail.data) return <Spinner />;
  const { order, items } = detail.data;
  // 한 장에 수십 건이 실린다. 상세에 뜨는 값이면 무엇으로든 걸러진다.
  const found = items.filter((row) => rowMatches(row, search, GIFT_STATUS_LABEL));
  const sortedItems = [...found].sort((a, b) => {
    return compareValues(a[itemSort.by], b[itemSort.by], itemSort.order) || b.id - a.id;
  });
  const itemPages = Math.max(1, Math.ceil(sortedItems.length / perPage));
  const itemPage = Math.min(page, itemPages);
  const shownItems = sortedItems.slice((itemPage - 1) * perPage, itemPage * perPage);

  return (
    <div>
      <div className={styles.batchHeader}>
        <button type="button" className={styles.backBtn} onClick={() => goto(null)}>
          <MdArrowBack />
          발주리스트 목록
        </button>
        <h3 className={styles.batchTitle}>
          <MdOutlineInventory className={styles.batchIcon} />
          발주 #{order.id}
        </h3>
        <span className={styles.batchMeta}>
          {order.count}건 · 송장 {order.shipped}건
          {order.shipped < order.count && (
            <b className={styles.shipWaiting}> · 안 들어온 것 {order.count - order.shipped}건</b>
          )}{' '}
          · {dateTimeText(order.created_at)} · {order.created_by} ·{' '}
          {order.groups.join(' · ') || '-'}
        </span>
        <div className={styles.batchActions}>
          <button
            type="button"
            className={styles.submitBtn}
            onClick={() => download(order.id)}
            disabled={downloading !== null || items.length === 0}
          >
            <MdDownload />
            {downloading === order.id ? '만드는 중…' : '엑셀 다시 받기'}
          </button>
        </div>
      </div>

      <div className={styles.searchSection}>
        <span className={styles.totalCount}>
          총 <span>{sortedItems.length}</span>건
          {search && items.length !== sortedItems.length && (
            <span className={styles.searchNote}> / 포함 {items.length}건</span>
          )}
        </span>
        <SearchBar
          value={search}
          onChange={setSearch}
          onReset={() => setSearch('')}
          placeholder="모든 항목 검색 — 고객명 · 주소 · 사은품 · 주문번호 · 상태 · 운송장"
        />
      </div>

      <div className={styles.controlsSection}>{perPageSelect}</div>

      {items.length === 0 ? (
        <EmptyState message="이 발주리스트에 남은 건이 없습니다." />
      ) : sortedItems.length === 0 ? (
        <EmptyState message={`'${search}' 검색 결과가 이 발주리스트에 없습니다.`} />
      ) : (
        <>
          <GiftTable
            rows={shownItems}
            showGroup
            actions={{ onOpen: onOpenRow, onShip }}
            sortBy={itemSort.by}
            sortOrder={itemSort.order}
            onSort={toggleItemSort}
          />
          <Pagination
            currentPage={itemPage}
            totalPages={itemPages}
            onPageChange={setPage}
            isLoading={detail.isFetching}
          />
        </>
      )}
    </div>
  );
});

export default GiftOrdersPanel;
