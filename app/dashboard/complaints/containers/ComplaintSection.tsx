'use client';

import React, { memo, useState } from 'react';
import { MdExpandMore } from 'react-icons/md';
import { useAuthStore } from '@/app/store/authStore';
import { useAlert } from '@/app/components/Alert/Alert';
import { isAdminRole } from '@/lib/roles';
import { useBulkReadComplaints, useUnreadComplaintIds, useComplaints, useUnreadComplaintCount } from '@/app/hooks/useComplaints';
import { useDepartments } from '@/app/hooks/useDepartments';
import { toAssignableDepartmentGroups } from '@/lib/departments';
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABEL,
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
 * 지사는 자기 소속 건만 본다. 관리자는 전체를 보며 담당 지사를 못 찾은 건을
 * 직접 정하고, 잘못 간 건을 옮긴다. 거르는 건 서버가 하고 여기서는 조회
 * 조건만 든다.
 */
const ACTION_DONE_TITLE = {
  assign_dept: '지사 지정 완료',
  bounce: '관리자에게 되돌림',
  return: '보완 요청 완료',
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
  // 무엇을 했는지만 적는다. 그다음 일은 화면이 상태로 말한다.
  if (body.action === 'return') return `${who}에 보완을 요청했습니다.`;
  if (body.action === 'bounce') return `${who}을 관리자에게 되돌렸습니다. 관리자가 지사를 다시 정합니다.`;

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
  // 사이드바 배지와 같은 값을 쓴다. 따로 세면 둘이 어긋난 숫자를 말하게 된다.
  const { data: badge } = useUnreadComplaintCount();
  const manageTabs = badge?.manageTabs ?? {};
  // 소속 목록은 관리자만 쓴다. 지사는 서버가 자기 범위로 고정한다.
  const { data: departments } = useDepartments(isAdmin);
  const unreadIds = useUnreadComplaintIds();
  const bulkRead = useBulkReadComplaints();

  /*
   * 아직 안 본 건을 한 번에 확인 처리한다.
   *
   * 상세를 하나씩 여는 것이 원래 길인데 스무 건이면 스무 번 열어야 한다.
   * 지금 걸어 둔 검색·소속에 맞는 미확인 건만 찍는다.
   */
  const readAllUnread = async () => {
    const ids = await unreadIds.mutateAsync({ search: list.search, group: list.group });
    if (ids.length === 0) {
      showAlert({ type: 'info', title: '확인할 것이 없음', message: '아직 안 본 민원이 없습니다.' });
      return;
    }
    showAlert({
      type: 'info',
      title: '전체 확인',
      message: `선택된 ${ids.length}건을 확인 처리하시겠습니까?`,
      showCancelButton: true,
      onConfirm: async () => {
        await bulkRead.mutateAsync(ids);
        showAlert({ type: 'success', title: '확인 완료', message: `${ids.length}건을 확인했습니다.` });
      },
    });
  };
  /*
   * 상세를 여는 것이 곧 확인이다.
   *
   * 확인의 뜻은 "이 내용으로 판단이 시작됐다"이고, 상세를 연 순간 그게 일어난다.
   * 버튼을 따로 두면 안 누르고 지나가고, 그동안 넣은 사람이 내용을 고쳐 지사가
   * 본 것과 다른 건을 처리하게 된다.
   *
   * **지사가 자기 미처리 건을 열 때만** 찍는다. 관리자가 훑어보다 찍으면 지사의
   * 첫 확인 기록이 사라지고, 넣은 사람의 수정이 남의 클릭으로 잠긴다. 관리자는
   * 목록의 [미확인] 버튼으로 뜻을 갖고 누른다.
   */
  const openDetail = (row: ComplaintRow) => {
    setDetail(row);
    if (isAdmin || row.status !== 'branch') return;
    // 이번 건을 이미 봤어도 뒤에 들어온 회차가 안 본 채 남아 있으면 찍는다.
    if (row.read_at && !(row.thread_unread ?? 0)) return;
    // 보러 온 사람에게 오류창을 띄우지 않는다. 실패하면 목록이 '미확인' 그대로다.
    list.patch({ id: row.id, body: { action: 'read' } }).catch(() => {});
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
   * 상태 탭. '담당 지사 없음'은 관리자만 할 일이 있는 자리라 지사에게는 안
   * 보인다 — 보여 주면 자기가 할 수 없는 건만 담긴 빈 탭이 된다.
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
          placeholder="모든 항목 검색 — 고객명 · 전화 · 주문번호 · 상품 · 담당 · 메모 · 상태 · 날짜"
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
        {statuses.map((status) => {
          // 옆 메뉴 배지에 든 숫자를 그 숫자가 사는 탭에 그대로 붙인다.
          const todo = manageTabs[status] ?? 0;
          return (
            <button
              key={status}
              type="button"
              className={`${styles.statusTab} ${list.status === status ? styles.active : ''}`}
              onClick={() => list.setStatus(status as ComplaintStatus)}
            >
              {COMPLAINT_STATUS_LABEL[status]}
              {todo > 0 && (
                <span
                  className={styles.tabCount}
                  title={status === 'branch' ? '아직 처리가 끝나지 않은 건' : '담당 지사를 정해 줘야 넘어가는 건'}
                >
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

      {/*
        확인은 지사가 하는 일이지만 관리자도 누를 수 있게 둔다 — 누가 눌렀는지는
        read_by 에 남으므로 기록이 거짓이 되지 않는다. 관리자가 소속을 걸어 두면
        그 지사 것만 찍힌다.
      */}
      <div className={styles.readAllRow}>
        <button
          type="button"
          className={styles.readAllBtn}
          onClick={readAllUnread}
          disabled={bulkRead.isPending || unreadIds.isPending}
        >
          {bulkRead.isPending ? '확인 중…' : '전체 확인'}
        </button>
        <span className={styles.readAllHint}>
          아직 안 본 민원을 한 번에 확인 처리합니다
          {isAdmin && list.group ? ` — 지금은 ${list.group}만` : ''}
        </span>
      </div>


      {list.isLoading ? (
        <Spinner />
      ) : list.complaints.length === 0 ? (
        <EmptyState message="해당하는 민원이 없습니다." />
      ) : (
        <>
          <ComplaintTable
            rows={list.complaints}
            isAdmin={isAdmin}
            onOpen={openDetail}
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
