'use client';

import React, { memo, useState } from 'react';
import { MdExpandMore } from 'react-icons/md';
import { useAuthStore } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import { isAdminRole } from '@/lib/roles';
import { useGiftRequests } from '@/app/hooks/useGifts';
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
import styles from '../page.module.css';

/**
 * 사은품 관리 — 사은품담당자의 자리.
 *
 * 지사가 전달한 신청을 받아 발주하고 배송 정보를 적는다. 내용이 이상하면
 * 사유를 적어 되돌린다(보완 요청). 전달되기 전 신청은 여기 안 보인다 —
 * 지사 안에서 아직 오가는 것은 담당자의 일이 아니다.
 *
 * 기본 탭은 '발주 대기'다. 이 화면에 들어오는 이유가 그것이라, 전체를 먼저
 * 보여주면 매번 탭을 눌러야 한다.
 */
const MANAGE_TABS: GiftStatus[] = ['forwarded', 'shipped', 'supplement'];

const GiftManageSection = memo(function GiftManageSectionComponent() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = isAdminRole(user?.role);

  const { showAlert } = useAlert();
  const list = useGiftRequests({ status: 'forwarded' });
  const { data: departments } = useDepartments();
  const groups = toAssignableDepartmentGroups(departments);

  const [detail, setDetail] = useState<GiftRequestRow | null>(null);
  const [target, setTarget] = useState<{ row: GiftRequestRow; kind: ManageKind } | null>(null);

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
          placeholder="고객명 · 주문번호 · 사은품 · 운송장번호"
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
        {/* 관리자는 지사 안에서 아직 오가는 것도 본다. 담당자에게는 서버가 안 준다. */}
        {isAdmin && (
          <button
            type="button"
            className={`${styles.statusTab} ${list.status === 'requested' ? styles.active : ''}`}
            onClick={() => list.setStatus('requested')}
          >
            {GIFT_STATUS_LABEL.requested}
          </button>
        )}
        {MANAGE_TABS.map((status) => (
          <button
            key={status}
            type="button"
            className={`${styles.statusTab} ${list.status === status ? styles.active : ''}`}
            onClick={() => list.setStatus(status)}
          >
            {GIFT_STATUS_LABEL[status]}
          </button>
        ))}
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

      {list.isLoading ? (
        <Spinner />
      ) : list.rows.length === 0 ? (
        <EmptyState message="전달된 사은품 신청이 없습니다." />
      ) : (
        <>
          <GiftTable
            rows={list.rows}
            showGroup
            actions={{
              onOpen: setDetail,
              onShip: (row) => setTarget({ row, kind: 'ship' }),
              onSupplement: (row) => setTarget({ row, kind: 'supplement' }),
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
              title: body.action === 'ship' ? '발주 완료' : '보완 요청 완료',
              message:
                body.action === 'ship'
                  ? `${target.row.customer_name} 님 ${target.row.gift_name} 발주를 기록했습니다.`
                  : `${target.row.customer_name} 님 신청을 보완 요청으로 되돌렸습니다. 신청한 설계사가 고쳐 다시 올립니다.`,
            });
          }}
        />
      )}
    </>
  );
});

export default GiftManageSection;
