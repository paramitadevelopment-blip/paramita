'use client';

import React, { memo, useState } from 'react';
import {
  MdExpandMore,
  MdListAlt,
  MdOutlineInventory,
  MdLocalShipping,
} from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import {
  useGiftRequests,
  useCreateGiftOrder,
  useGiftBadgeCount,
  useShipPaste,
  usePickAllForwarded,
  downloadGiftOrderExcel,
} from '@/app/hooks/useGifts';
import { useDepartments } from '@/app/hooks/useDepartments';
import { toAssignableDepartmentGroups } from '@/lib/departments';
import {
  GIFT_STATUS_LABEL,
  needsStaffRead,
  type GiftRequestRow,
  type GiftStatus,
} from '@/lib/gifts';
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
  const pickAll = usePickAllForwarded();
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
   * 지금 조건에 맞는 발주 대기 건을 통째로 고른다.
   *
   * 머리 체크박스는 그 페이지 것만 고르므로 백 건이면 열 페이지를 돌아야 한다.
   * 검색·지사를 걸어 둔 채로 고르므로 "한울부원 것만 전부"도 된다.
   */
  const pickAllForwarded = async () => {
    const ids = await pickAll.mutateAsync({ search: list.search, group: list.group });
    if (ids.length === 0) {
      showAlert({
        type: 'info',
        title: '고를 것이 없음',
        message: '지금 조건에 맞는 발주 대기 건이 없습니다.',
      });
      return;
    }
    setPicked(new Set(ids));
    showAlert({
      type: 'success',
      title: '전체 선택',
      message: `발주 대기 ${ids.length}건을 골랐습니다.`,
    });
  };

  /*
   * 고른 것을 한 번에 확인 처리한다.
   *
   * 상세를 하나씩 여는 것이 원래 길인데, 서른 건이면 서른 번 열어야 한다.
   * 이미 본 건은 서버가 400으로 돌려보내므로 그냥 세지 않고 넘긴다.
   */
  const [reading, setReading] = useState(false);
  const readPicked = () => {
    const ids = [...picked];
    showAlert({
      type: 'info',
      title: '선택 확인',
      message: `고른 ${ids.length}건을 확인 처리합니다. 확인하면 지사가 더 이상 고칠 수 없습니다.`,
      showCancelButton: true,
      onConfirm: async () => {
        setReading(true);
        let done = 0;
        try {
          for (const id of ids) {
            // ponytail: 건별 요청. 수백 건이 되면 묶음 API로 올린다.
            await list
              .patch({ id, body: { action: 'read' } })
              .then(() => done++)
              .catch(() => {});
          }
        } finally {
          setReading(false);
        }
        setPicked(new Set());
        showAlert({
          type: 'success',
          title: '확인 완료',
          message: `${done}건을 확인했습니다.${ids.length > done ? ` ${ids.length - done}건은 이미 확인한 건입니다.` : ''}`,
        });
      },
    });
  };

  /*
   * 상세를 여는 것이 곧 확인이다.
   *
   * 버튼을 따로 두면 안 누르고 지나가고, 그동안 지사가 내용을 고쳐 담당자가
   * 본 것과 다른 건이 발주된다. 열어 본 순간 확인이 찍히고 지사의 수정은
   * 닫힌다 — 민원의 '상세 열기 = 확인'과 같은 규칙이다. 발주 묶기·보완
   * 요청도 같은 효과가 있지만, 그 전에 열어 보는 것이 보통의 순서다.
   */
  const openDetail = (row: GiftRequestRow) => {
    setDetail(row);
    if (!needsStaffRead(row)) return;
    // 보러 온 사람에게 오류창을 띄우지 않는다. 실패하면 목록이 '미확인' 그대로다.
    list.patch({ id: row.id, body: { action: 'read' } }).catch(() => {});
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
          onOpenRow={openDetail}
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

      {/*
        고르고 묶는 자리. 표 바로 위에 둔다 — 고르는 일은 표에서 하는 일이다.

        [전체 선택]은 고른 것이 없어도 늘 보여야 한다. 머리 체크박스는 그 페이지
        것만 고르므로 백 건이면 열 페이지를 돌게 되는데, 그 사실을 아는 사람만
        찾아 쓰는 자리에 두면 없는 것과 같다.
      */}
      {!list.isLoading && list.rows.length > 0 && (
        <div className={styles.forwardBar}>
          <button
            type="button"
            className={styles.selectAllBtn}
            onClick={pickAllForwarded}
            disabled={pickAll.isPending}
            title="지금 걸어 둔 검색·지사에 맞는 발주 대기 건을 전부 고릅니다"
          >
            {pickAll.isPending ? '고르는 중…' : '전체 선택'}
          </button>
          {picked.size > 0 ? (
            <>
              {/* 고르기와 푸는 것은 짝이라 나란히 둔다. */}
              <button type="button" className={styles.ghostBtn} onClick={() => setPicked(new Set())}>
                선택 해제
              </button>
              <span>
                <strong>{picked.size}건</strong> 골랐습니다
              </span>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={readPicked}
                disabled={reading}
              >
                {reading ? '확인 중…' : '확인 처리'}
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={askOrder}
                disabled={createOrder.isPending}
              >
                <MdOutlineInventory />
                발주리스트 만들기
              </button>
            </>
          ) : (
            <span className={styles.forwardHint}>
              발주할 건을 체크하거나 [전체 선택]을 누르세요
            </span>
          )}
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
              onOpen: openDetail,
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
