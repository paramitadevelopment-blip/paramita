'use client';

import React, { memo, useState } from 'react';
import { MdAdd, MdExpandMore, MdSend } from 'react-icons/md';
import { useAuthStore } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import { canForwardGiftRequests, canViewAllGiftRequests } from '@/lib/roles';
import { useGiftRequests, useRequestGift, useGiftBadgeCount } from '@/app/hooks/useGifts';
import { useDepartments } from '@/app/hooks/useDepartments';
import { toAssignableDepartmentGroups } from '@/lib/departments';
import {
  GIFT_STATUSES,
  GIFT_STATUS_LABEL,
  type GiftEditableFields,
  type GiftRequestRow,
  type GiftStatus,
} from '@/lib/gifts';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import GiftTable from '@/app/components/GiftRequest/GiftTable';
import GiftRequestFormModal from '@/app/components/GiftRequest/GiftRequestFormModal';
import GiftDetailModal from '@/app/components/GiftRequest/GiftDetailModal';
import styles from '../page.module.css';

/**
 * 사은품 신청.
 *
 * 설계사는 자기가 넣은 것을, 지사는 소속에서 넣은 것을 본다. 지사는 여기서
 * 골라 사은품담당자에게 보낸다 — 신청과 전달이 한 화면인 이유는, 지사가
 * "무엇이 올라왔나"를 보는 자리와 "보낸다"를 누르는 자리가 같아야 한 번에
 * 끝나기 때문이다.
 */
const GiftRequestSection = memo(function GiftRequestSectionComponent() {
  const user = useAuthStore((state) => state.user);
  const role = user?.role;
  const isAdmin = canViewAllGiftRequests(role);
  const canForward = canForwardGiftRequests(role);

  const { showAlert } = useAlert();
  const list = useGiftRequests();
  const request = useRequestGift();
  const { data: badge } = useGiftBadgeCount();
  // 소속 목록은 관리자만 쓴다. 지사·설계사는 서버가 자기 범위로 고정한다.
  const { data: departments } = useDepartments(isAdmin);
  const groups = toAssignableDepartmentGroups(departments);

  const [isFormOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GiftRequestRow | null>(null);
  const [detail, setDetail] = useState<GiftRequestRow | null>(null);
  // 지사가 골라 둔 것. 페이지를 넘겨도 남는다 — 두 페이지에 걸쳐 고르는 일이 있다.
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const handleCreate = async (input: { orderNo: string } & GiftEditableFields) => {
    const created = await request.mutateAsync(input);
    setFormOpen(false);
    showAlert({
      type: 'success',
      title: '신청 완료',
      message: `${created.customer_name} 님 ${created.gift_name} 신청을 넣었습니다. 지사가 확인 후 사은품담당자에게 전달합니다.`,
    });
  };

  const handleEdit = async (input: { orderNo: string } & GiftEditableFields) => {
    if (!editing) return;
    const wasSupplement = editing.status === 'supplement';
    const { orderNo: _omit, ...fields } = input;
    await list.patch({ id: editing.id, body: { action: 'update', ...fields } });
    setEditing(null);
    showAlert({
      type: 'success',
      title: wasSupplement ? '다시 올림' : '수정 완료',
      message: wasSupplement
        ? '고친 내용으로 다시 올렸습니다. 지사가 확인 후 다시 전달합니다.'
        : '신청 내용을 고쳤습니다.',
    });
  };

  const askDelete = (row: GiftRequestRow) => {
    showAlert({
      type: 'warning',
      title: '신청 삭제',
      message: `${row.customer_name} 님 ${row.gift_name} 신청을 정말 삭제하시겠습니까?`,
      showCancelButton: true,
      onConfirm: () => list.remove(row.id),
    });
  };

  const togglePick = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (ids: number[]) =>
    setPicked((prev) => {
      const every = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of ids) {
        if (every) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const askForward = () => {
    const ids = [...picked];
    showAlert({
      type: 'info',
      title: '사은품담당자에게 전달',
      message: `고른 ${ids.length}건을 사은품담당자에게 전달하시겠습니까? 전달한 뒤에는 설계사가 내용을 고칠 수 없습니다.`,
      showCancelButton: true,
      onConfirm: async () => {
        const result = await list.forward(ids);
        setPicked(new Set());
        showAlert({
          type: 'success',
          title: '전달 완료',
          message:
            result.skipped > 0
              ? `${result.forwarded}건을 전달했습니다. ${result.skipped}건은 이미 전달됐거나 전달할 수 없어 빠졌습니다.`
              : `${result.forwarded}건을 사은품담당자에게 전달했습니다.`,
        });
      },
    });
  };

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
          placeholder="고객명 · 주문번호 · 사은품 · 신청자"
        />
        <button type="button" className={styles.submitBtn} onClick={() => setFormOpen(true)}>
          <MdAdd />
          사은품 신청
        </button>
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
        {GIFT_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={`${styles.statusTab} ${list.status === status ? styles.active : ''}`}
            onClick={() => list.setStatus(status as GiftStatus)}
          >
            {GIFT_STATUS_LABEL[status]}
            {/* 보완 요청은 그냥 지나치면 안 되는 자리다. 건수를 붙인다. */}
            {status === 'supplement' && (badge?.requests ?? 0) > 0 && !canForward && (
              <span className={styles.tabCount}>{badge?.requests}</span>
            )}
          </button>
        ))}
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

      {/* 지사가 고른 것을 보내는 자리. 고른 게 있을 때만 나온다. */}
      {canForward && picked.size > 0 && (
        <div className={styles.forwardBar}>
          <span>
            <strong>{picked.size}건</strong> 골랐습니다
          </span>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={askForward}
            disabled={list.isForwarding}
          >
            <MdSend />
            사은품담당자에게 전달
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => setPicked(new Set())}>
            선택 해제
          </button>
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
            actions={{
              select: canForward
                ? { picked, onToggle: togglePick, onToggleAll: toggleAll }
                : undefined,
              onOpen: setDetail,
              onEdit: setEditing,
              onDelete: askDelete,
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

      {detail && <GiftDetailModal row={detail} onClose={() => setDetail(null)} />}
    </>
  );
});

export default GiftRequestSection;
