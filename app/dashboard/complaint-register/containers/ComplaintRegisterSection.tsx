'use client';

import React, { memo, useState } from 'react';
import { MdAdd, MdContentPaste, MdExpandMore } from 'react-icons/md';
import {
  useComplaints,
  useUnreadComplaintCount,
  useRegisterComplaint,
  useRegisterComplaints,
  type ComplaintInput,
} from '@/app/hooks/useComplaints';
import { useAlert } from '@/app/components/Alert/Alert';
import { useAuthStore } from '@/app/store/authStore';
import { isAdminRole } from '@/lib/roles';
import {
  COMPLAINT_STATUS_LABEL,
  type ComplaintRow,
  type ComplaintStatus,
} from '@/lib/complaints';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import ComplaintFormModal from '../components/ComplaintFormModal';
import ComplaintPasteModal from '../components/ComplaintPasteModal';
import ComplaintDetailModal from '@/app/components/ComplaintDetail/ComplaintDetailModal';
import RegisteredTable from '../components/RegisteredTable';
import styles from '../page.module.css';

/**
 * 내가 넣은 민원과 그 결과.
 *
 * 이 화면에서 오래 하는 일은 넣는 것이 아니라 "그래서 어떻게 됐나"를 보는
 * 것이다. 그래서 목록이 화면이고, 접수는 창으로 연다.
 *
 * 넣은 직후에는 어느 지사로 갔는지를 목록 위에 한 번 더 알린다 — 목록 맨 위에
 * 그 줄이 뜨긴 하지만, 잘못 적었을 때 바로 알아채려면 눈에 띄어야 한다.
 */
/*
 * 넣은 사람이 볼 상태.
 *
 * '미처리'는 세우지 않는다 — 넣은 사람 입장에서는 "넘어가서 진행 중"이고
 * 그다음은 지사 사정이다. 여기서는 내가 무언가 해야 하는 것만 세운다.
 */
const REGISTER_TABS: ComplaintStatus[] = ['unassigned', 'returned', 'done', 'withdrawn'];

const ComplaintRegisterSection = memo(function ComplaintRegisterSectionComponent() {
  const { showAlert } = useAlert();
  // 관리자만 담당 지사를 본다. 넣은 사람에게는 그다음이 남의 지사 사정이다.
  const isAdmin = isAdminRole(useAuthStore((state) => state.user?.role));
  const list = useComplaints();
  // 사이드바 배지와 같은 값을 쓴다. 따로 세면 둘이 어긋난 숫자를 말하게 된다.
  const { data: badge } = useUnreadComplaintCount();
  const registerTabs = badge?.registerTabs ?? {};
  const register = useRegisterComplaint();
  const registerMany = useRegisterComplaints();
  const [isFormOpen, setFormOpen] = useState(false);
  const [isPasteOpen, setPasteOpen] = useState(false);
  // 고치는 중인 건. 없으면 새로 넣는 것이다.
  const [editing, setEditing] = useState<ComplaintRow | null>(null);
  // 상세로 열어 둔 건. 목록에 없는 값(상품·통화일시·처리 내용 등)을 여기서 본다.
  const [detail, setDetail] = useState<ComplaintRow | null>(null);
  const [lastResult, setLastResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleSubmit = async (input: ComplaintInput) => {
    const created = await register.mutateAsync(input);
    setLastResult(
      created.assigned_group
        ? {
            ok: true,
            message: `${created.customer_name} 님 민원이 담당 지사로 전달되었습니다.`,
          }
        : {
            ok: false,
            message: `${created.customer_name} 님은 배포 기록에서 찾지 못했습니다. 관리자가 확인 후 지사를 정합니다.`,
          },
    );
    setFormOpen(false);
    return created;
  };

  /*
   * 고칠 때도 담당 지사를 다시 찾는다. 그래서 결과 안내를 새로 넣을 때와
   * 똑같이 보여준다 — 주문번호를 고쳤으면 그 자리에서 어디로 갔는지 봐야 한다.
   */
  const handleEdit = async (input: ComplaintInput) => {
    if (!editing) return;
    const result: any = await list.patch({
      id: editing.id,
      body: { action: 'update', ...input },
    });
    const row = result?.data;
    if (row) {
      setLastResult(
        row.assigned_group
          ? {
              ok: true,
              message: `${row.customer_name} 님 민원이 담당 지사로 전달되었습니다.`,
            }
          : {
              ok: false,
              message: `${row.customer_name} 님은 배포 기록에서 찾지 못했습니다. 관리자가 확인 후 지사를 정합니다.`,
            },
      );
    }
    setEditing(null);
    return row;
  };

  /*
   * 지우기.
   *
   * 넣은 사람이 아무도 안 본 건을 물릴 때는 그냥 묻고 지운다 — 잘못 적은 것을
   * 바로 지우는 일이라 남길 사정이 없다. 관리자는 처리가 끝난 건도, 남이 넣은
   * 건도 지울 수 있어 사유를 받는다. 그 사유는 보관본에 함께 남는다.
   */
  const askDelete = (row: ComplaintRow) => {
    let reason = '';
    showAlert({
      type: 'warning',
      title: '민원 삭제',
      message: isAdmin ? (
        <>
          <p>
            {row.customer_name} 님 민원을 삭제합니다. 보완 이력과 배정 이력도 함께 사라집니다.
            되돌릴 수 없습니다.
          </p>
          <label className={styles.withdrawField}>
            <span>삭제 사유</span>
            <input
              type="text"
              maxLength={500}
              placeholder="예: 시험 삼아 넣은 건"
              onChange={(e) => {
                reason = e.target.value;
              }}
            />
          </label>
        </>
      ) : (
        `${row.customer_name} 님 민원을 정말 삭제하시겠습니까?`
      ),
      showCancelButton: true,
      onConfirm: () => {
        if (isAdmin && !reason.trim()) {
          showAlert({ type: 'warning', title: '민원 삭제', message: '삭제 사유를 적어 주세요.' });
          return;
        }
        list.remove({ id: row.id, reason: reason.trim() });
        setLastResult(null);
      },
    });
  };

  /*
   * 철회. 보완 요청을 받았는데 진행할 필요가 없어진 건을 닫는다.
   * 지우는 게 아니라 사유를 물어 닫는다 — 관리자가 나중에 "왜 안 했나"를 본다.
   */
  const askWithdraw = (row: ComplaintRow) => {
    let reason = '';
    showAlert({
      type: 'warning',
      title: '민원 철회',
      message: (
        <>
          <p>{row.customer_name} 님 민원을 철회하시겠습니까? 철회해도 기록은 남습니다.</p>
          <label className={styles.withdrawField}>
            <span>사유 (선택)</span>
            <input
              type="text"
              maxLength={500}
              placeholder="예: 다른 민원과 중복"
              onChange={(e) => {
                reason = e.target.value;
              }}
            />
          </label>
        </>
      ),
      showCancelButton: true,
      onConfirm: () => {
        list.patch({ id: row.id, body: { action: 'withdraw', reason: reason.trim() } });
        setLastResult(null);
      },
    });
  };

  /** 표에 있는 값을 입력 칸 모양으로 되돌린다. date 칸은 'YYYY-MM-DD'만 받는다. */
  const toInput = (row: ComplaintRow): ComplaintInput => ({
    product: row.product ?? '',
    customerName: row.customer_name,
    phone: row.phone ?? '',
    orderNo: row.order_no ?? '',
    receivedAt: row.received_at ?? '',
    orderConfirmedAt: row.order_confirmed_at ?? '',
    // datetime-local 칸은 초를 뺀 'YYYY-MM-DDTHH:mm'까지만 받는다.
    calledAt: row.called_at ? row.called_at.slice(0, 16) : '',
    callMemo: row.call_memo ?? '',
  });

  return (
    <>
      <div className={styles.listHeader}>
        <span className={styles.totalCount}>
          총 <span>{list.pagination?.totalRecords ?? 0}</span>건
        </span>
        <SearchBar
          value={list.search}
          onChange={list.setSearch}
          onReset={() => list.setSearch('')}
          placeholder="모든 항목 검색 — 고객명 · 전화 · 주문번호 · 상품 · 담당 · 메모 · 상태 · 날짜"
        />
        {/* 여러 건은 붙여넣기, 한 건은 직접 입력. 둘 다 남겨 둔다. */}
        <button type="button" className={styles.ghostBtn} onClick={() => setPasteOpen(true)}>
          <MdContentPaste />
          붙여넣기로 등록
        </button>
        <button type="button" className={styles.submitBtn} onClick={() => setFormOpen(true)}>
          <MdAdd />
          민원 등록
        </button>
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
            <option value="customer_name">수령인순</option>
            <option value="phone">전화번호순</option>
            <option value="order_no">주문번호순</option>
            <option value="received_at">접수일자순</option>
            <option value="order_confirmed_at">발주확인일순</option>
            <option value="called_at">통화일시순</option>
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
        상태로 거르기.
        넣은 건이 쌓이면 "보완 요청 받은 게 뭐였지"를 목록에서 눈으로 찾게 된다.
        보완 탭에는 건수를 함께 적는다 — 다른 탭과 달리 지나치면 그 민원은
        아무 데도 가지 않고 멈춰 있다.
      */}
      <div className={styles.statusTabs}>
        <button
          type="button"
          className={`${styles.statusTab} ${list.status === '' ? styles.active : ''}`}
          onClick={() => list.setStatus('')}
        >
          전체
        </button>
        {REGISTER_TABS.map((status) => {
          // 옆 메뉴 배지에 든 숫자를 그 숫자가 사는 탭에 그대로 붙인다.
          const todo = registerTabs[status] ?? 0;
          return (
            <button
              key={status}
              type="button"
              className={`${styles.statusTab} ${list.status === status ? styles.active : ''}`}
              onClick={() => list.setStatus(status)}
            >
              {COMPLAINT_STATUS_LABEL[status]}
              {todo > 0 && (
                <span className={styles.tabCount} title="고쳐서 다시 보내야 하는 건">
                  {todo}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {lastResult && (
        <div className={lastResult.ok ? styles.resultOk : styles.resultWarn}>
          {lastResult.message}
        </div>
      )}

      {list.isLoading ? (
        <Spinner />
      ) : list.complaints.length === 0 ? (
        <EmptyState message="아직 넣은 민원이 없습니다." />
      ) : (
        <>
          <RegisteredTable
            rows={list.complaints}
            showGroup={isAdmin}
            statusLabel={COMPLAINT_STATUS_LABEL}
            sortBy={list.sort.by}
            sortOrder={list.sort.order}
            onSort={list.toggleSort}
            onOpen={setDetail}
            onEdit={setEditing}
            isAdmin={isAdmin}
            onDelete={askDelete}
            onWithdraw={askWithdraw}
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
        <ComplaintFormModal
          onClose={() => setFormOpen(false)}
          onSubmit={handleSubmit}
          isSubmitting={register.isPending}
        />
      )}

      {/*
        넣은 사람에게는 배정 근거를 보여주지 않는다 — 남의 지사 사정이다.
        관리자는 다르다: 배정을 정하는 사람이라 무엇을 보고 그 지사가 됐는지 알아야 한다.
      */}
      {detail && (
        <ComplaintDetailModal row={detail} isAdmin={isAdmin} onClose={() => setDetail(null)} />
      )}

      {isPasteOpen && (
        <ComplaintPasteModal
          onClose={() => {
            setPasteOpen(false);
            setLastResult(null);
          }}
          isSubmitting={registerMany.isPending}
          onSubmit={async (rows) => {
            const done = await registerMany.mutateAsync(rows);
            setLastResult(null);
            return done;
          }}
        />
      )}

      {editing && (
        /* 보완 요청을 받은 건을 고치는 것은 '수정'이 아니라 '재요청'이다 — 저장하는 순간 다시 넘어간다. */
        <ComplaintFormModal
          onClose={() => setEditing(null)}
          onSubmit={handleEdit}
          initial={toInput(editing)}
          mode={editing.status === 'returned' ? 'resubmit' : 'edit'}
          isSubmitting={list.isPatching}
        />
      )}
    </>
  );
});

export default ComplaintRegisterSection;
