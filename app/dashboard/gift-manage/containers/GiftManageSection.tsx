'use client';

import React, { memo, useState } from 'react';
import { MdExpandMore, MdListAlt, MdOutlineInventory, MdLocalShipping } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import {
  useGiftRequests,
  useCreateGiftOrder,
  useGiftBadgeCount,
  useShipPaste,
  downloadGiftOrderExcel,
} from '@/app/hooks/useGifts';
import { useDepartments } from '@/app/hooks/useDepartments';
import { toAssignableDepartmentGroups } from '@/lib/departments';
import { GIFT_STATUS_LABEL, type GiftRequestRow, type GiftStatus } from '@/lib/gifts';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import GiftTable from '@/app/components/GiftRequest/GiftTable';
import GiftDetailModal from '@/app/components/GiftRequest/GiftDetailModal';
import GiftManageModal, { type ManageKind } from '@/app/components/GiftRequest/GiftManageModal';
import GiftOrdersPanel from '@/app/components/GiftRequest/GiftOrdersPanel';
import GiftShipPasteModal from '@/app/components/GiftRequest/GiftShipPasteModal';
import styles from '../page.module.css';

/**
 * 사은품 관리 — 사은품담당자의 자리.
 *
 * 지사가 등록한 건이 그대로 여기 뜬다. 담당자는 체크해서 **발주리스트 한 장**으로
 * 거래처에 보내고, 송장이 나오면 건별로 택배사·운송장번호를 채운다. 내용이
 * 이상하면 그 건만 보완 요청으로 되돌린다.
 *
 * 두 탭이다.
 *   신청 건     지사가 등록한 건. 여기서 체크해 발주리스트를 만든다. 기본 탭은 '발주 대기'
 *   발주리스트  만든 장 하나하나. 열면 실린 건이 보이고 엑셀을 다시 받거나 송장을 적는다
 */
type View = 'items' | 'orders';
const MANAGE_TABS: GiftStatus[] = ['forwarded', 'ordered', 'shipped', 'supplement', 'withdrawn'];

const GiftManageSection = memo(function GiftManageSectionComponent() {
  const { showAlert } = useAlert();
  // 이 화면은 담당자의 자리다. 관리자 확인 대기는 아직 담당자 일이 아니라 안 온다(scope: 'manage').
  const list = useGiftRequests({ status: 'forwarded', scope: 'manage' });
  // 사이드바 배지와 같은 값을 쓴다. 따로 세면 둘이 어긋난 숫자를 말하게 된다.
  const { data: badge } = useGiftBadgeCount();
  const waitingCount = badge?.manage ?? 0;
  const createOrder = useCreateGiftOrder();
  const shipPaste = useShipPaste();
  const { data: departments } = useDepartments();
  const groups = toAssignableDepartmentGroups(departments);

  const [view, setView] = useState<View>('items');
  // 발주처가 채워 돌려준 표를 붙여넣는 창.
  const [isShipPasteOpen, setShipPasteOpen] = useState(false);
  // 방금 만든 발주리스트. 만들면 그 탭으로 옮겨 가서 바로 연다.
  const [openOrderId, setOpenOrderId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GiftRequestRow | null>(null);
  const [target, setTarget] = useState<{ row: GiftRequestRow; kind: ManageKind } | null>(null);
  // 발주할 것으로 골라 둔 건. 페이지를 넘겨도 남는다.
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const togglePick = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (ids: number[]) =>
    setPicked((prev) => {
      const every = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of ids) {
        if (every) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  /*
   * 확인. 눌린 순간 지사는 그 건을 더 못 고친다 — 그래서 한 번 묻는다.
   * 발주 묶기·보완 요청도 같은 효과가 있지만 그건 이미 확인창을 거친다.
   */
  const askRead = (row: GiftRequestRow) => {
    showAlert({
      type: 'info',
      title: '신청 확인',
      message: `${row.customer_name} 님 ${row.gift_name} 신청을 확인하셨습니까? 확인하면 지사가 더 이상 고칠 수 없습니다.`,
      showCancelButton: true,
      onConfirm: () => list.patch({ id: row.id, body: { action: 'read' } }),
    });
  };

  /*
   * 발주리스트 만들기. 만들어지면 곧바로 엑셀이 내려받아진다.
   * 빠진 건이 있으면 몇 건인지 말한다 — 그 사이 다른 담당자가 먼저 묶었을 수 있다.
   */
  const askOrder = () => {
    const ids = [...picked];
    showAlert({
      type: 'info',
      title: '발주리스트 만들기',
      message: `고른 ${ids.length}건으로 발주리스트를 만드시겠습니까? 만들면 거래처 양식 엑셀이 내려받아지고, 그 건들은 '발주 보냄'이 됩니다.`,
      showCancelButton: true,
      onConfirm: async () => {
        const result = await createOrder.mutateAsync(ids);
        setPicked(new Set());
        try {
          await downloadGiftOrderExcel(result.order.id);
        } catch (err) {
          showAlert({ type: 'error', title: '엑셀 내려받기 실패', message: (err as Error).message });
        }
        // 만든 장이 어디 있는지 보여준다 — 발주리스트 탭에서 그 장을 연다.
        setOpenOrderId(result.order.id);
        setView('orders');
        showAlert({
          type: 'success',
          title: '발주리스트 생성',
          message:
            result.skipped > 0
              ? `발주 #${result.order.id} — ${result.ordered}건을 담았습니다. ${result.skipped}건은 발주 대기가 아니어서 빠졌습니다.`
              : `발주 #${result.order.id} — ${result.ordered}건을 담았습니다.`,
        });
      },
    });
  };

  /** 지난 발주리스트를 다시 받는다. 메일을 못 찾거나 거래처가 다시 달라고 할 때. */
  const redownload = async (orderId: number) => {
    try {
      await downloadGiftOrderExcel(orderId);
    } catch (err) {
      showAlert({ type: 'error', title: '엑셀 내려받기 실패', message: (err as Error).message });
    }
  };

  return (
    <>
      {/* ── 화면 탭 ─────────────────────────────────────────── */}
      <div className={styles.viewTabs}>
        <button
          type="button"
          className={`${styles.viewTab} ${view === 'items' ? styles.active : ''}`}
          onClick={() => setView('items')}
        >
          <MdListAlt />
          신청 건
        </button>
        <button
          type="button"
          className={`${styles.viewTab} ${view === 'orders' ? styles.active : ''}`}
          onClick={() => setView('orders')}
        >
          <MdOutlineInventory />
          발주리스트
        </button>
        {/*
          발주처가 채워 준 표를 그대로 붙여넣는 자리. 두 탭 어디서나 쓴다 —
          송장은 보낸 장 단위로 한꺼번에 오지만, 어느 화면에 있든 바로 채운다.
        */}
        <button
          type="button"
          className={`${styles.submitBtn} ${styles.viewTabsAction}`}
          onClick={() => setShipPasteOpen(true)}
        >
          <MdLocalShipping />
          배송 정보 붙여넣기
        </button>
      </div>

      {view === 'orders' ? (
        <GiftOrdersPanel
          initialOrderId={openOrderId}
          onOpenRow={setDetail}
          onShip={(row) => setTarget({ row, kind: 'ship' })}
          onDownload={redownload}
        />
      ) : (
        <>
      <div className={styles.searchSection}>
        <span className={styles.totalCount}>
          총 <span>{list.pagination?.totalRecords ?? 0}</span>건
        </span>
        <SearchBar
          value={list.search}
          onChange={list.setSearch}
          onReset={() => list.setSearch('')}
          placeholder="모든 항목 검색 — 고객명 · 주소 · 사은품 · 주문번호 · 상태 · 날짜 · 운송장"
        />
      </div>

      <div className={styles.controlsSection}>
        <div className={styles.selectWrapper}>
          <select
            className={styles.select}
            value={list.sort.by}
            onChange={(e) => list.setSortBy(e.target.value)}
          >
            <option value="created_at">신청일순</option>
            <option value="customer_name">고객명순</option>
            <option value="gift_name">사은품순</option>
            <option value="group_name">지사순</option>
            <option value="requester_name">신청자순</option>
            <option value="order_date">발주일순</option>
            <option value="status">상태순</option>
          </select>
          <MdExpandMore className={styles.selectIcon} />
        </div>
        <div className={styles.selectWrapper}>
          <select
            className={styles.select}
            value={list.limit}
            onChange={(e) => list.setLimit(Number(e.target.value))}
          >
            <option value="10">10개씩보기</option>
            <option value="20">20개씩보기</option>
            <option value="30">30개씩보기</option>
            <option value="50">50개씩보기</option>
          </select>
          <MdExpandMore className={styles.selectIcon} />
        </div>
      </div>

      <div className={styles.statusTabs}>
        <button
          type="button"
          className={`${styles.statusTab} ${list.status === '' ? styles.active : ''}`}
          onClick={() => list.setStatus('')}
        >
          전체
        </button>
        {MANAGE_TABS.map((status) => {
          /*
            옆 메뉴 배지에 든 숫자를 그 숫자가 사는 탭에 붙인다. 담당자가 손댈
            것은 발주 대기 하나다 — 발주 보냄은 발주처가 송장을 줘야 움직이는
            자리라, 세워 두면 담당자가 지울 수 없는 숫자가 계속 떠 있게 된다.
            그건 발주리스트 탭에서 장마다 'N/M 송장'으로 본다.
          */
          const todo = status === 'forwarded' ? waitingCount : 0;
          return (
            <button
              key={status}
              type="button"
              className={`${styles.statusTab} ${list.status === status ? styles.active : ''}`}
              onClick={() => list.setStatus(status)}
            >
              {GIFT_STATUS_LABEL[status]}
              {todo > 0 && (
                <span className={styles.tabCount} title="아직 발주리스트에 담지 않은 건">
                  {todo}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {groups.length > 0 && (
        <div className={styles.departmentsFilter}>
          <button
            type="button"
            className={`${styles.departmentBtn} ${list.group === '' ? styles.active : ''}`}
            onClick={() => list.setGroup('')}
          >
            전체 지사
          </button>
          {groups.map((name) => (
            <button
              key={name}
              type="button"
              className={`${styles.departmentBtn} ${list.group === name ? styles.active : ''}`}
              onClick={() => list.setGroup(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* 고른 것을 발주리스트로 묶는 자리. 고른 게 있을 때만 나온다. */}
      {picked.size > 0 && (
        <div className={styles.forwardBar}>
          <span>
            <strong>{picked.size}건</strong> 골랐습니다
          </span>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={askOrder}
            disabled={createOrder.isPending}
          >
            <MdOutlineInventory />
            발주리스트 만들기
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => setPicked(new Set())}>
            선택 해제
          </button>
        </div>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : list.rows.length === 0 ? (
        <EmptyState message="등록된 사은품 신청이 없습니다." />
      ) : (
        <>
          <GiftTable
            rows={list.rows}
            showGroup
            actions={{
              select: {
                picked,
                selectable: (row) => row.status === 'forwarded',
                onToggle: togglePick,
                onToggleAll: toggleAll,
              },
              onOpen: setDetail,
              onRead: askRead,
              onShip: (row) => setTarget({ row, kind: 'ship' }),
              onSupplement: (row) => setTarget({ row, kind: 'supplement' }),
              onDownloadOrder: redownload,
            }}
            sortBy={list.sort.by}
            sortOrder={list.sort.order}
            onSort={list.toggleSort}
          />
          <Pagination
            currentPage={list.page}
            totalPages={list.pagination?.totalPages ?? 1}
            onPageChange={list.changePage}
            isLoading={list.isLoading}
          />
        </>
      )}
        </>
      )}

      {isShipPasteOpen && (
        <GiftShipPasteModal
          isSubmitting={shipPaste.isPending}
          onClose={() => setShipPasteOpen(false)}
          onSubmit={async (rows) => {
            const done = await shipPaste.mutateAsync(rows);
            return done;
          }}
        />
      )}

      {detail && <GiftDetailModal row={detail} onClose={() => setDetail(null)} />}

      {target && (
        <GiftManageModal
          row={target.row}
          kind={target.kind}
          isSubmitting={list.isPatching}
          onClose={() => setTarget(null)}
          onSubmit={async (body) => {
            await list.patch({ id: target.row.id, body });
            setTarget(null);
            showAlert({
              type: 'success',
              title: body.action === 'ship' ? '배송 정보 저장' : '보완 요청 완료',
              message:
                body.action === 'ship'
                  ? `${target.row.customer_name} 님 ${target.row.gift_name} 배송 정보를 저장했습니다.`
                  : `${target.row.customer_name} 님 신청을 보완 요청으로 되돌렸습니다.`,
            });
          }}
        />
      )}
    </>
  );
});

export default GiftManageSection;
