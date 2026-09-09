'use client';

import React, { memo, useState } from 'react';
import { MdVerified } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import { useGiftRequests, useGiftThreads, type GiftThreadEntry } from '@/app/hooks/useGifts';
import { GIFT_STATUS_LABEL, type GiftRequestRow } from '@/lib/gifts';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import Pagination from '@/app/components/Pagination/Pagination';
import GiftCheckModal from './GiftCheckModal';
import styles from './GiftRequest.module.css';

/**
 * 관리자 확인 — 같은 주문번호로 다시 들어온 신청이 기다리는 자리.
 *
 * 한 주문번호로 여러 상품을 가입하거나 사은품을 추가로 달라는 일이 있어 두 번째
 * 신청을 막지는 않는다. 대신 왜 또 보내는지를 적게 하고, 관리자가 그 사유를 보고
 * "또 보내도 되는가"를 판정한다.
 *
 * **묶음째 보여준다.** 확인 대기 줄만 세워 놓으면 줄마다 주문번호가 다를 뿐,
 * 그 번호로 지난번에 무엇이 나갔는지가 안 보인다 — 그걸 모르고는 판정할 수 없다.
 * 그래서 주문번호별로 묶어, 이미 나간 건을 위에 세우고 이번 건을 아래에 짚는다.
 * 민원의 중복 처리와 같은 생각이다.
 *
 * **관리자만 보는 자리다.** 지사에게는 이 탭을 내지 않는다 — 여기서 할 수 있는
 * 일이 없기 때문이다. 지사는 신청 건 탭에서 자기 건을 '관리자 확인 대기'로 보고,
 * 확인이 나기 전까지 거기서 고치거나 지운다.
 */

const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('ko-KR').slice(0, -1) : '-';

interface GiftCheckPanelProps {
  onOpenRow: (row: GiftRequestRow) => void;
}

const GiftCheckPanel = memo(function GiftCheckPanelComponent({
  onOpenRow,
}: GiftCheckPanelProps) {
  const { showAlert } = useAlert();
  // 이 탭만의 목록이다 — 신청 건 탭의 검색·정렬을 건드리지 않는다.
  const list = useGiftRequests({ status: 'pending_check' });
  const [busy, setBusy] = useState(false);
  /*
   * 확인은 창을 열어서도 한다. 목록에 묶음이 보이지만, 주소·송장까지 다 보고
   * 정하려면 창이 편하다 — 목록은 훑는 자리, 창은 정하는 자리다.
   */
  const [target, setTarget] = useState<GiftRequestRow | null>(null);

  // 화면에 뜬 줄들의 주문번호로 묶음을 한 번에 받아 온다.
  const { data: threads = {} } = useGiftThreads(list.rows.map((r) => r.order_no));

  const doCheck = async () => {
    if (!target) return;
    const row = target;
    setBusy(true);
    try {
      await list.patch({ id: row.id, body: { action: 'check' } });
      setTarget(null);
      showAlert({
        type: 'success',
        title: '확인 완료',
        message: `${row.customer_name} 님 신청을 확인했습니다.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const doSupplement = async (reason: string) => {
    if (!target) return;
    const row = target;
    setBusy(true);
    try {
      await list.patch({ id: row.id, body: { action: 'supplement', reason } });
      setTarget(null);
      showAlert({
        type: 'success',
        title: '보완 요청',
        message: `${row.customer_name} 님 신청에 보완을 요청했습니다.`,
      });
    } finally {
      setBusy(false);
    }
  };

  if (list.isLoading) return <Spinner />;

  /** 그 줄의 묶음에서 이번 건을 뺀 것 — 이미 나갔거나 접힌 지난 신청. */
  const priorOf = (row: GiftRequestRow): GiftThreadEntry[] =>
    (threads[row.order_no] ?? []).filter((e) => e.id !== row.id);

  return (
    <>
      <div className={styles.searchSection}>
        <span className={styles.totalCount}>
          총 <span>{list.pagination?.totalRecords ?? 0}</span>건
        </span>
        <SearchBar
          value={list.search}
          onChange={list.setSearch}
          onReset={() => list.setSearch('')}
          placeholder="모든 항목 검색 — 고객명 · 주소 · 사은품 · 주문번호 · 신청 사유 · 날짜"
        />
      </div>

      <p className={styles.checkGuide}>
        <MdVerified />
        같은 주문번호로 이미 신청된 적이 있는 건입니다.
      </p>

      {list.rows.length === 0 ? (
        <EmptyState message="확인을 기다리는 신청이 없습니다." />
      ) : (
        <>
          <div className={styles.tableContainer}>
            <table className={`${styles.table} ${styles.checkTable}`}>
              <thead>
                <tr>
                  <th>신청일</th>
                  <th>고객명</th>
                  <th>사은품</th>
                  <th>수량</th>
                  <th>주소</th>
                  <th>지사</th>
                  <th>신청자</th>
                  <th>상태</th>
                  <th>작업</th>
                </tr>
              </thead>
              {list.rows.map((row) => {
                const prior = priorOf(row);
                return (
                  /*
                   * 묶음 하나가 tbody 하나다. 줄 사이를 벌리지 않아도 어디까지가
                   * 한 주문번호인지 눈에 들어온다.
                   */
                  <tbody key={row.id} className={styles.checkGroup}>
                    <tr className={styles.checkGroupHead}>
                      <td colSpan={9}>
                        <span className={styles.checkOrderNo}>주문번호 {row.order_no}</span>
                        <span className={styles.checkCustomer}>{row.customer_name}</span>
                        <span className={styles.checkCount}>
                          이 번호로 {prior.length + 1}건
                          {prior.length === 0 && ' · 지난 신청 없음'}
                        </span>
                      </td>
                    </tr>

                    {/* 이미 나간 건. 읽기만 한다 — 여기서 손댈 것은 이번 건뿐이다. */}
                    {prior.map((entry) => (
                      <tr key={entry.id} className={styles.checkPrior}>
                        <td>{dateText(entry.created_at)}</td>
                        <td>{entry.customer_name}</td>
                        <td>{entry.gift_name}</td>
                        <td>{entry.quantity}</td>
                        <td className={styles.noteCell} title={entry.address ?? ''}>
                          {entry.address || '-'}
                        </td>
                        <td>{entry.group_name}</td>
                        <td>{entry.requester_name}</td>
                        <td>
                          <div className={styles.checkStatusCell}>
                            <span className={`${styles.statusBadge} ${styles[`status_${entry.status}`]}`}>
                              {GIFT_STATUS_LABEL[entry.status]}
                            </span>
                            {entry.order_id && (
                              <span className={styles.shipNote}>
                                발주 #{entry.order_id}
                                {entry.tracking_no ? ` · ${entry.courier} ${entry.tracking_no}` : ''}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className={styles.actionCell}>
                          <span className={styles.muted}>지난 신청</span>
                        </td>
                      </tr>
                    ))}

                    {/* 이번 건. 판정할 줄이다. */}
                    <tr className={styles.checkCurrent}>
                      <td>{dateText(row.created_at)}</td>
                      <td>{row.customer_name}</td>
                      <td>{row.gift_name}</td>
                      <td>{row.quantity}</td>
                      <td className={styles.noteCell} title={row.address ?? ''}>
                        {row.address || '-'}
                      </td>
                      <td>{row.group_name}</td>
                      <td>{row.requester_name}</td>
                      <td>
                        <div className={styles.checkStatusCell}>
                          {/* 배지와 '이번 건'은 한 줄에 나란히, 사유는 그 아래로. */}
                          <span className={styles.checkStatusTop}>
                            <span className={`${styles.statusBadge} ${styles.status_pending_check}`}>
                              {GIFT_STATUS_LABEL.pending_check}
                            </span>
                            <span className={styles.checkHereTag}>이번 건</span>
                          </span>
                          {row.check_reason && (
                            <span className={styles.checkReasonNote} title={row.check_reason}>
                              사유: {row.check_reason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={styles.actionCell}>
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          onClick={() => onOpenRow(row)}
                        >
                          상세
                        </button>
                        <button
                          type="button"
                          className={styles.unreadBtn}
                          onClick={() => setTarget(row)}
                          disabled={busy}
                          title="같은 주문번호로 들어온 신청을 함께 보고 확인합니다"
                        >
                          확인
                        </button>
                      </td>
                    </tr>
                  </tbody>
                );
              })}
            </table>
          </div>

          <Pagination
            currentPage={list.page}
            totalPages={list.pagination?.totalPages ?? 1}
            onPageChange={list.changePage}
            isLoading={list.isLoading}
          />
        </>
      )}

      {target && (
        <GiftCheckModal
          row={target}
          isBusy={busy}
          onClose={() => setTarget(null)}
          onCheck={doCheck}
          onSupplement={doSupplement}
        />
      )}
    </>
  );
});

export default GiftCheckPanel;
