'use client';

import React, { memo, useState } from 'react';
import { MdAdd, MdExpandMore, MdListAlt, MdContentPaste, MdVerified } from 'react-icons/md';
import { useAuthStore } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import { canViewAllGiftRequests } from '@/lib/roles';
import {
  useGiftRequests,
  useRequestGift,
  useGiftBadgeCount,
  useRegisterGifts,
  useBulkShipRead,
} from '@/app/hooks/useGifts';
import { useDepartments } from '@/app/hooks/useDepartments';
import { toAssignableDepartmentGroups } from '@/lib/departments';
import {
  GIFT_STATUSES,
  GIFT_STATUS_LABEL,
  needsShipCheck,
  type GiftRequestRow,
  type GiftStatus,
} from '@/lib/gifts';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import GiftTable from '@/app/components/GiftRequest/GiftTable';
import GiftRequestFormModal, {
  type GiftFormSubmit,
} from '@/app/components/GiftRequest/GiftRequestFormModal';
import GiftDetailModal from '@/app/components/GiftRequest/GiftDetailModal';
import GiftCheckPanel from '@/app/components/GiftRequest/GiftCheckPanel';
import GiftPasteModal from '@/app/components/GiftRequest/GiftPasteModal';
import type { GiftPasteRow } from '@/lib/giftPaste';
import styles from '../page.module.css';

/**
 * 사은품 신청 — 지사의 자리. 두 탭이다.
 *
 *   신청 건      지사가 등록한 건 하나하나. 등록하면 곧바로 담당자에게 뜬다
 *   관리자 확인  배포 기록 없이 들어온 건. 관리자가 봐 줘야 신청 건으로 내려온다
 *
 * 지사가 모아 두었다가 보내는 단계는 없다 — 등록이 곧 전달이다. 취합은
 * 담당자가 체크해서 발주리스트로 묶을 때 한다.
 *
 * 설계사가 개인별로 넣는 것은 나중에 연다(lib/roles.ts의 canRequestGift 참고).
 */
type View = 'items' | 'checks';

/**
 * 탭 배지가 무엇을 센 숫자인지. 상태에 든 건수와 다를 수 있어서 —
 * 배송 정보 입력됨은 열 건이어도 아직 안 본 것이 셋이면 3이 뜬다 — 밝혀 둔다.
 */
const TAB_COUNT_HINT: Partial<Record<GiftStatus, string>> = {
  pending_check: '관리자 확인을 기다리는 재신청',
  supplement: '보완 요청을 받아 수정해 다시 제출해야 하는 건',
  shipped: '배송 정보가 입력되었으나 확인하지 않은 건',
};

const GiftRequestSection = memo(function GiftRequestSectionComponent() {
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const isAdmin = canViewAllGiftRequests(role);

  const { showAlert } = useAlert();
  const list = useGiftRequests();
  const request = useRequestGift();
  const registerMany = useRegisterGifts();
  const bulkShipRead = useBulkShipRead();
  const { data: badge } = useGiftBadgeCount();
  // 소속 목록은 관리자만 쓴다. 지사는 서버가 자기 범위로 고정한다.
  const { data: departments } = useDepartments(isAdmin);
  const groups = toAssignableDepartmentGroups(departments);

  const [view, setView] = useState<View>('items');
  const [isFormOpen, setFormOpen] = useState(false);
  const [isPasteOpen, setPasteOpen] = useState(false);
  const [editing, setEditing] = useState<GiftRequestRow | null>(null);
  const [detail, setDetail] = useState<GiftRequestRow | null>(null);

  const handleCreate = async (input: GiftFormSubmit) => {
    const created = await request.mutateAsync(input);
    setFormOpen(false);
    // 기록 없이 들어간 건은 담당자가 아니라 관리자에게 먼저 간다. 안내가 달라야 한다.
    const waiting = created.status === 'pending_check';
    // 관리자만 확인 탭이 있다. 지사는 신청 건 목록에 그대로 남아 자기 건을 본다.
    if (waiting && isAdmin) setView('checks');
    showAlert({
      type: 'success',
      title: waiting ? '재신청 — 관리자 확인 요청' : '신청 등록',
      message: waiting
        ? `${created.customer_name} 님 ${created.gift_name} 재신청을 등록했습니다. 관리자 확인 후 전달됩니다.`
        : `${created.customer_name} 님 ${created.gift_name} 신청을 등록했습니다.`,
    });
  };

  const handleEdit = async (input: GiftFormSubmit) => {
    if (!editing) return;
    const wasSupplement = editing.status === 'supplement';
    const { orderNo: _omit, ...fields } = input;
    await list.patch({ id: editing.id, body: { action: 'update', ...fields } });
    setEditing(null);
    showAlert({
      type: 'success',
      title: wasSupplement ? '재제출 완료' : '수정 완료',
      message: wasSupplement
        ? '수정한 내용으로 다시 제출했습니다.'
        : '신청 내용을 수정했습니다.',
    });
  };

  /*
   * 삭제. 관리자는 상태와 무관하게 지우되 사유를 남긴다 — 발주가 나간 건을
   * 지우는 일이라 "왜"가 없으면 나중에 아무도 답을 못 한다. 지사는 담당자가
   * 아직 안 본 것만 지우고, 그건 잘못 적은 걸 물리는 일이라 사유를 묻지 않는다.
   */
  const askDelete = (row: GiftRequestRow) => {
    let reason = '';
    showAlert({
      type: 'warning',
      title: '신청 삭제',
      message: isAdmin ? (
        <>
          <p>
            {row.customer_name} 님 {row.gift_name} 신청을 삭제합니다. 발주·배송 기록도 함께
            사라집니다. 되돌릴 수 없습니다.
          </p>
          <label className={styles.withdrawField}>
            <span>삭제 사유</span>
            <input
              type="text"
              maxLength={500}
              placeholder="예: 시험 삼아 등록한 건"
              onChange={(e) => {
                reason = e.target.value;
              }}
            />
          </label>
        </>
      ) : (
        `${row.customer_name} 님 ${row.gift_name} 신청을 정말 삭제하시겠습니까?`
      ),
      showCancelButton: true,
      onConfirm: () => {
        if (isAdmin && !reason.trim()) {
          showAlert({ type: 'warning', title: '신청 삭제', message: '삭제 사유를 적어 주세요.' });
          return;
        }
        list.remove({ id: row.id, reason: reason.trim() });
      },
    });
  };

  /*
   * 상세를 여는 것이 곧 배송 정보 확인이다.
   *
   * 송장이 채워진 건은 지사가 봐야 배지에서 내려간다. 버튼을 따로 두면 안 누르고
   * 지나가서 배지가 안 내려간다. 열어 본 순간 찍는다 — 민원·담당자 확인과 같은
   * 규칙이다. 관리자는 찍지 않는다. 송장을 기다린 쪽은 신청한 지사다.
   */
  const openDetail = (row: GiftRequestRow) => {
    setDetail(row);
    if (isAdmin || !needsShipCheck(row)) return;
    // 보러 온 사람에게 오류창을 띄우지 않는다. 실패하면 목록이 '미확인' 그대로다.
    list.patch({ id: row.id, body: { action: 'confirmShip' } }).catch(() => {});
  };

  /*
   * 송장이 채워진 건을 한 번에 확인한다.
   *
   * 하나씩 열어야 배지가 내려가는데, 발주가 한 번에 스무 건씩 나가면 스무 번을
   * 열어야 한다. 서버가 소속 것 전부를 한 번의 UPDATE로 찍는다.
   */
  const readAllShipped = () => {
    // 탭 배지가 이미 세고 있는 수다. 몇 건인지 보고 누르게 한다.
    const waiting = badge?.tabs?.shipped ?? 0;
    if (waiting === 0) {
      showAlert({ type: 'info', title: '확인할 것이 없음', message: '확인하지 않은 배송 정보가 없습니다.' });
      return;
    }
    showAlert({
      type: 'info',
      title: '전체 확인',
      message: `선택된 ${waiting}건을 확인 처리하시겠습니까?`,
      showCancelButton: true,
      onConfirm: async () => {
        const read = await bulkShipRead.mutateAsync();
        showAlert({ type: 'success', title: '확인 완료', message: `${read}건을 확인했습니다.` });
      },
    });
  };

  const askWithdraw = (row: GiftRequestRow) => {
    let reason = '';
    showAlert({
      type: 'warning',
      title: '신청 철회',
      message: (
        <>
          <p>
            {row.customer_name} 님 {row.gift_name} 신청을 철회하시겠습니까? 철회해도 기록은
            남습니다.
          </p>
          <label className={styles.withdrawField}>
            <span>사유 (선택)</span>
            <input
              type="text"
              maxLength={500}
              placeholder="예: 고객이 사은품을 원하지 않음"
              onChange={(e) => {
                reason = e.target.value;
              }}
            />
          </label>
        </>
      ),
      showCancelButton: true,
      onConfirm: () =>
        list.patch({ id: row.id, body: { action: 'withdraw', reason: reason.trim() } }),
    });
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
        {/*
          재신청이 멈춰 있는 자리. **관리자에게만 낸다** — 지사는 여기서 할 수 있는
          일이 없다. 자기 건은 신청 건 탭에 '관리자 확인 대기'로 뜨고 거기서 고치고
          지운다. 못 누를 탭을 내주면 "왜 확인이 안 되냐"고 묻게 된다.
        */}
        {isAdmin && (
          <button
            type="button"
            className={`${styles.viewTab} ${view === 'checks' ? styles.active : ''}`}
            onClick={() => setView('checks')}
          >
            <MdVerified />
            관리자 확인
            {(badge?.requests ?? 0) > 0 && (
              <span className={styles.tabCount}>{badge?.requests}</span>
            )}
          </button>
        )}
      </div>

      {view === 'checks' && isAdmin ? (
        <GiftCheckPanel onOpenRow={setDetail} />
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
            {/* 여러 건은 붙여넣기, 한 건은 직접 입력. 같은 일의 두 길이라 붙여 둔다. */}
            <div className={styles.searchActions}>
              <button type="button" className={styles.ghostBtn} onClick={() => setPasteOpen(true)}>
                <MdContentPaste />
                붙여넣기로 등록
              </button>
              <button type="button" className={styles.submitBtn} onClick={() => setFormOpen(true)}>
                <MdAdd />
                사은품 신청
              </button>
            </div>
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
                <option value="order_no">주문번호순</option>
                {isAdmin && <option value="group_name">지사순</option>}
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
            {GIFT_STATUSES.map((status) => {
              /*
                옆 메뉴 배지에 든 숫자를 그 숫자가 사는 탭에 그대로 붙인다.
                상태에 든 건수가 아니라 **손대야 할 건수**다 — 배송 정보는 아직
                확인 안 누른 것만 센다. 그래서 탭 배지의 합이 곧 메뉴 배지다.
              */
              const todo = badge?.tabs?.[status] ?? 0;
              return (
                <button
                  key={status}
                  type="button"
                  className={`${styles.statusTab} ${list.status === status ? styles.active : ''}`}
                  onClick={() => list.setStatus(status as GiftStatus)}
                >
                  {GIFT_STATUS_LABEL[status]}
                  {todo > 0 && (
                    <span className={styles.tabCount} title={TAB_COUNT_HINT[status]}>
                      {todo}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {isAdmin && groups.length > 0 && (
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
            송장을 한 번에 확인하는 자리. 관리자에게는 안 보인다 — 송장을 기다린
            쪽은 신청한 지사이고, 관리자가 대신 누르면 지사 배지가 아무도 안 본
            채로 내려간다.
          */}
          {!isAdmin && (
            <div className={styles.readAllRow}>
              <button
                type="button"
                className={styles.readAllBtn}
                onClick={readAllShipped}
                disabled={bulkShipRead.isPending}
              >
                {bulkShipRead.isPending ? '확인 중…' : '전체 확인'}
              </button>
              <span className={styles.readAllHint}>
                송장이 입력되었으나 확인하지 않은 건을 한 번에 확인 처리합니다
              </span>
            </div>
          )}

          {list.isLoading ? (
            <Spinner />
          ) : list.rows.length === 0 ? (
            <EmptyState message="아직 사은품 신청이 없습니다." />
          ) : (
            <>
              <GiftTable
                rows={list.rows}
                showGroup={isAdmin}
                isAdmin={isAdmin}
                actions={{
                  onOpen: openDetail,
                  onEdit: setEditing,
                  onDelete: askDelete,
                  onWithdraw: askWithdraw,
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

      {isFormOpen && (
        <GiftRequestFormModal
          isSubmitting={request.isPending}
          onClose={() => setFormOpen(false)}
          onSubmit={handleCreate}
        />
      )}

      {editing && (
        <GiftRequestFormModal
          editing={editing}
          isSubmitting={list.isPatching}
          onClose={() => setEditing(null)}
          onSubmit={handleEdit}
        />
      )}

      {isPasteOpen && (
        <GiftPasteModal
          isSubmitting={registerMany.isPending}
          onClose={() => setPasteOpen(false)}
          onSubmit={async (rows: GiftPasteRow[]) => registerMany.mutateAsync({ rows })}
        />
      )}

      {detail && <GiftDetailModal row={detail} onClose={() => setDetail(null)} />}
    </>
  );
});

export default GiftRequestSection;
