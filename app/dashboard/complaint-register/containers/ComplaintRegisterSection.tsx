'use client';

import React, { memo, useState } from 'react';
import { MdAdd } from 'react-icons/md';
import { useComplaints, useRegisterComplaint, type ComplaintInput } from '@/app/hooks/useComplaints';
import { useAlert } from '@/app/components/Alert/Alert';
import { COMPLAINT_STATUS_LABEL, type ComplaintRow } from '@/lib/complaints';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import ComplaintFormModal from '../components/ComplaintFormModal';
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
const ComplaintRegisterSection = memo(function ComplaintRegisterSectionComponent() {
  const { showAlert } = useAlert();
  const list = useComplaints();
  const register = useRegisterComplaint();
  const [isFormOpen, setFormOpen] = useState(false);
  // 고치는 중인 건. 없으면 새로 넣는 것이다.
  const [editing, setEditing] = useState<ComplaintRow | null>(null);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSubmit = async (input: ComplaintInput) => {
    const created = await register.mutateAsync(input);
    setLastResult(
      created.assigned_group
        ? { ok: true, message: `${created.customer_name} 님 민원이 담당 지사로 전달되었습니다.` }
        : {
            ok: false,
            message: `${created.customer_name} 님은 배포 기록에서 찾지 못했습니다. 관리자가 확인 후 지사를 정합니다.`,
          }
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
          ? { ok: true, message: `${row.customer_name} 님 민원이 담당 지사로 전달되었습니다.` }
          : {
              ok: false,
              message: `${row.customer_name} 님은 배포 기록에서 찾지 못했습니다. 관리자가 확인 후 지사를 정합니다.`,
            }
      );
    }
    setEditing(null);
    return row;
  };

  const askDelete = (row: ComplaintRow) => {
    showAlert({
      type: 'warning',
      title: '민원 삭제',
      message: `${row.customer_name} 님 민원을 정말 삭제하시겠습니까?`,
      showCancelButton: true,
      onConfirm: () => {
        list.remove(row.id);
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
          placeholder="고객명 · 주문번호 · 전화번호"
        />
        <button type="button" className={styles.submitBtn} onClick={() => setFormOpen(true)}>
          <MdAdd />
          민원 등록
        </button>
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
            statusLabel={COMPLAINT_STATUS_LABEL}
            sortBy={list.sort.by}
            sortOrder={list.sort.order}
            onSort={list.toggleSort}
            onEdit={setEditing}
            onDelete={askDelete}
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

      {editing && (
        <ComplaintFormModal
          onClose={() => setEditing(null)}
          onSubmit={handleEdit}
          initial={toInput(editing)}
          isSubmitting={list.isPatching}
        />
      )}
    </>
  );
});

export default ComplaintRegisterSection;
