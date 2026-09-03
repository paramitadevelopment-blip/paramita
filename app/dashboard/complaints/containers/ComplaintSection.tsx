'use client';

import React, { memo, useState } from 'react';
import { useAuthStore } from '@/app/store/authStore';
import { isAdminRole, isAgentRole, canAssignComplaintAgent } from '@/lib/roles';
import { useComplaints } from '@/app/hooks/useComplaints';
import { useDepartments } from '@/app/hooks/useDepartments';
import { toAssignableDepartmentGroups } from '@/lib/departments';
import { COMPLAINT_STATUSES, COMPLAINT_STATUS_LABEL, type ComplaintRow, type ComplaintStatus } from '@/lib/complaints';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import ComplaintTable from '../components/ComplaintTable';
import ComplaintActionModal, { type ActionKind } from '../components/ComplaintActionModal';
import styles from '../page.module.css';

/**
 * 나에게 온 민원.
 *
 * 지사는 자기 소속 건을, 설계사는 자기에게 넘어온 건만 본다. 관리자는 전체를
 * 보며 담당 지사를 못 찾은 건을 직접 정한다. 거르는 건 서버가 하고 여기서는
 * 조회 조건만 든다.
 */
const ComplaintSection = memo(function ComplaintSectionComponent() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = isAdminRole(user?.role);
  const isAgent = isAgentRole(user?.role);
  const canAssignAgent = canAssignComplaintAgent(user?.role);

  const list = useComplaints();
  // 소속 목록은 관리자만 쓴다. 지사·설계사는 서버가 자기 범위로 고정한다.
  const { data: departments } = useDepartments(isAdmin);
  const [target, setTarget] = useState<{ row: ComplaintRow; kind: ActionKind } | null>(null);

  /*
   * 사람이 속한 조직만 고른다.
   *
   * '이외지역'은 주소를 못 읽은 건이 모이는 자리라 파일은 생기지만 맡은 사람이
   * 없다. 목록에 두면 아무도 안 보는 곳으로 민원을 넘기게 되고, 서버도 그 값을
   * 거부해서(isAssignableGroup) 눌러도 되지 않는 항목이 된다.
   */
  const groups = toAssignableDepartmentGroups(departments);

  /*
   * 상태 탭.
   *
   * '담당 지사 없음'은 관리자만 할 일이 있는 자리라 지사·설계사에게는 안 보인다.
   * 보여 주면 자기가 할 수 없는 건만 담긴 빈 탭이 된다.
   */
  const statuses = COMPLAINT_STATUSES.filter((s) => (s === 'unassigned' ? isAdmin : true));

  return (
    <>
      <div className={styles.searchSection}>
        <div className={styles.totalCount}>
          총 <span>{list.pagination?.totalRecords ?? 0}</span>건
        </div>
        <SearchBar
          value={list.search}
          onChange={list.setSearch}
          onReset={() => list.setSearch('')}
          placeholder="고객명 · 주문번호 · 전화번호"
        />
      </div>

      <div className={styles.controlsSection}>
        <select
          className={styles.select}
          value={list.sort.by}
          onChange={(e) => list.setSortBy(e.target.value)}
        >
          <option value="created_at">등록일순</option>
          <option value="received_at">접수일자순</option>
          <option value="called_at">통화일시순</option>
          <option value="customer_name">수령인순</option>
          <option value="phone">전화번호순</option>
          <option value="order_no">주문번호순</option>
          {/* 열이 안 보이는 사람에게는 그 정렬도 내지 않는다 — 눌러도 표가 그대로다. */}
          {isAdmin && <option value="assigned_group">담당 지사순</option>}
          {!isAgent && <option value="agent_name">담당 설계사순</option>}
          <option value="status">상태순</option>
        </select>

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
      </div>

      <div className={styles.statusTabs}>
        <button
          type="button"
          className={`${styles.statusTab} ${list.status === '' ? styles.active : ''}`}
          onClick={() => list.setStatus('')}
        >
          전체
        </button>
        {statuses.map((status) => (
          <button
            key={status}
            type="button"
            className={`${styles.statusTab} ${list.status === status ? styles.active : ''}`}
            onClick={() => list.setStatus(status as ComplaintStatus)}
          >
            {COMPLAINT_STATUS_LABEL[status]}
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
            전체
          </button>
          {groups.map((group) => (
            <button
              key={group}
              type="button"
              className={`${styles.departmentBtn} ${list.group === group ? styles.active : ''}`}
              onClick={() => list.setGroup(group)}
            >
              {group}
            </button>
          ))}
        </div>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : list.complaints.length === 0 ? (
        <EmptyState message="해당하는 민원이 없습니다." />
      ) : (
        <>
          <ComplaintTable
            rows={list.complaints}
            isAdmin={isAdmin}
            isAgent={isAgent}
            canAssignAgent={canAssignAgent}
            sortBy={list.sort.by}
            sortOrder={list.sort.order}
            onSort={list.toggleSort}
            onAction={(row, kind) => setTarget({ row, kind })}
          />
          <Pagination
            currentPage={list.page}
            totalPages={list.pagination?.totalPages ?? 1}
            onPageChange={list.changePage}
            isLoading={list.isLoading}
          />
        </>
      )}

      {target && (
        <ComplaintActionModal
          row={target.row}
          kind={target.kind}
          groups={groups}
          isSubmitting={list.isPatching}
          onClose={() => setTarget(null)}
          onSubmit={async (body) => {
            await list.patch({ id: target.row.id, body });
            setTarget(null);
          }}
        />
      )}
    </>
  );
});

export default ComplaintSection;
