'use client';

import React, { memo, useState } from 'react';
import { MdExpandMore } from 'react-icons/md';
import { useAuthStore } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import { isAdminRole } from '@/lib/roles';
import { useComplaints } from '@/app/hooks/useComplaints';
import { useDepartments } from '@/app/hooks/useDepartments';
import { toAssignableDepartmentGroups } from '@/lib/departments';
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABEL,
  PENDING_STATUS,
  type ComplaintRow,
  type ComplaintStatus,
} from '@/lib/complaints';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import ComplaintTable from '../components/ComplaintTable';
import ComplaintActionModal, { type ActionKind } from '../components/ComplaintActionModal';
import ComplaintDetailModal from '@/app/components/ComplaintDetail/ComplaintDetailModal';
import styles from '../page.module.css';

/**
 * 나에게 온 민원.
 *
 * 지사는 자기 소속 건을, 설계사는 자기에게 넘어온 건만 본다. 관리자는 전체를
 * 보며 담당 지사를 못 찾은 건을 직접 정한다. 거르는 건 서버가 하고 여기서는
 * 조회 조건만 든다.
 */
const ACTION_DONE_TITLE = {
  assign_dept: '지사 지정 완료',
  return: '반려 완료',
  assign_agent: '설계사 지정 완료',
  handle: '처리 완료',
} as const;

/** 끝난 뒤 한 줄. 무슨 일이 일어났는지를 그대로 적는다. */
function doneMessage(
  body: { action: keyof typeof ACTION_DONE_TITLE; group?: string },
  row: ComplaintRow,
  result: { closed?: number } | undefined
): string {
  const who = `${row.customer_name} 님 민원`;
  if (body.action === 'assign_dept') return `${who}을 ${body.group} 지사로 넘겼습니다.`;
  if (body.action === 'return') return `${who}을 등록한 사람에게 반려했습니다.`;
  if (body.action === 'assign_agent') return `${who}의 담당 설계사를 지정했습니다.`;

  // 같은 건이 함께 끝났으면 그 수를 말한다. 한 건뿐이면 굳이 세지 않는다.
  const closed = result?.closed ?? 1;
  return closed > 1
    ? `${who}을 처리했습니다. 같은 건 ${closed}건이 함께 처리 완료되었습니다.`
    : `${who}을 처리했습니다.`;
}

const ComplaintSection = memo(function ComplaintSectionComponent() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = isAdminRole(user?.role);

  const list = useComplaints();
  const { showAlert } = useAlert();
  // 소속 목록은 관리자만 쓴다. 지사·설계사는 서버가 자기 범위로 고정한다.
  const { data: departments } = useDepartments(isAdmin);
  /*
   * 확인은 되돌릴 수 없다 — 누가 언제 봤는지가 그대로 기록으로 남고, 그 순간
   * 넣은 사람은 더 이상 고치지 못한다. 목록에서 손이 미끄러져 눌리기 쉬운
   * 자리라, 한 번 묻고 넘어간다.
   */
  const askRead = (row: ComplaintRow) => {
    showAlert({
      type: 'info',
      title: '민원 확인',
      message: `${row.customer_name} 님 민원의 상세 내용을 확인하셨습니까?`,
      showCancelButton: true,
      onConfirm: () => list.patch({ id: row.id, body: { action: 'read' } }),
    });
  };

  const [target, setTarget] = useState<{
    row: ComplaintRow;
    kind: ActionKind;
  } | null>(null);
  // 상세로 열어 둔 건. 목록에 없는 값까지 여기서 본다.
  const [detail, setDetail] = useState<ComplaintRow | null>(null);

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
   * '지사 확인 대기'와 '설계사 처리 대기'는 걸러 볼 일이 없어 빼 둔다 — 아직
   * 처리되지 않았다는 뜻이라 어차피 목록 위쪽에 쌓인다. 각 줄의 상태 표시는
   * 그대로 남는다.
   *
   * '담당 지사 없음'은 관리자만 할 일이 있는 자리라 지사·설계사에게는 안 보인다.
   * 보여 주면 자기가 할 수 없는 건만 담긴 빈 탭이 된다.
   */
  const HIDDEN_TABS = ['branch', 'agent'];
  const statuses = COMPLAINT_STATUSES.filter((s) => {
    if (HIDDEN_TABS.includes(s)) return false;
    return s === 'unassigned' ? isAdmin : true;
  });

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
        {/* 화살표는 다른 화면과 같이 react-icons 를 쓴다. */}
        <div className={styles.selectWrapper}>
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
            <option value="status">상태순</option>
            <option value="read_at">확인순</option>
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

      {/*
        밀린 건만 보기.
        전체를 볼 수 있다는 것과 밀린 걸 찾을 수 있다는 건 다르다 — 건수가
        쌓이면 목록을 아무리 봐도 안 보인다.
      */}
      <label className={styles.overdueToggle}>
        <input
          type="checkbox"
          checked={list.overdueOnly}
          onChange={(e) => list.setOverdueOnly(e.target.checked)}
        />
        3일 넘게 처리 안 된 건만 보기
      </label>

      <div className={styles.statusTabs}>
        <button
          type="button"
          className={`${styles.statusTab} ${list.status === '' ? styles.active : ''}`}
          onClick={() => list.setStatus('')}
        >
          전체
        </button>
        {/*
          미처리 = 지사에 와 있는 것 + 설계사에게 넘긴 것. 단계는 달라도 둘 다
          아직 안 끝난 것이라, 지사가 "내가 할 일"을 볼 때는 한 덩어리로 본다.
          사이드바 배지가 세는 것과 같은 범위다 — 배지를 누르고 들어와 그만큼이
          보여야 숫자를 믿을 수 있다.
        */}
        <button
          type="button"
          className={`${styles.statusTab} ${list.status === PENDING_STATUS ? styles.active : ''}`}
          onClick={() => list.setStatus(PENDING_STATUS)}
        >
          미처리
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
            onRead={askRead}
            onOpen={setDetail}
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

      {detail && (
        <ComplaintDetailModal row={detail} isAdmin={isAdmin} onClose={() => setDetail(null)} />
      )}

      {target && (
        <ComplaintActionModal
          row={target.row}
          kind={target.kind}
          groups={groups}
          isSubmitting={list.isPatching}
          onClose={() => setTarget(null)}
          onSubmit={async (body) => {
            const result = await list.patch({ id: target.row.id, body });
            setTarget(null);
            /*
             * 무엇이 끝났는지 말해 준다.
             *
             * 창만 닫히면 눌린 건지 아닌지를 목록에서 눈으로 찾아 확인하게 된다.
             * 특히 처리는 같은 건 여러 개가 한꺼번에 끝나므로, 몇 건이 끝났는지
             * 그 자리에서 알려 줘야 목록을 세어 보지 않는다.
             */
            showAlert({
              type: 'success',
              title: ACTION_DONE_TITLE[body.action],
              message: doneMessage(body, target.row, result),
            });
          }}
        />
      )}
    </>
  );
});

export default ComplaintSection;
