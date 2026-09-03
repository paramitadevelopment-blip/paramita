'use client';

import React, { memo, useState } from 'react';
import { MdClose } from 'react-icons/md';
import { useComplaintAgents } from '@/app/hooks/useComplaints';
import type { ComplaintRow } from '@/lib/complaints';
import styles from '../page.module.css';

/**
 * 민원 한 건을 다음 자리로 넘기는 창.
 *
 * 네 동작이 한 창에 있다 — 무엇을 하든 "어느 고객의 어떤 민원인가"를 다시
 * 확인하고 한 가지 값만 적는 모양이라, 창을 넷으로 나누면 같은 껍데기가 넷이 된다.
 */

export type ActionKind = 'assign_dept' | 'return' | 'assign_agent' | 'handle';

type SubmitBody =
  | { action: 'assign_dept'; group: string }
  | { action: 'return'; reason: string }
  | { action: 'assign_agent'; agentId: number }
  | { action: 'handle'; note: string };

const TITLE: Record<ActionKind, string> = {
  assign_dept: '담당 지사 지정',
  return: '민원담당자에게 반려',
  assign_agent: '담당 설계사 지정',
  handle: '처리 내용 입력',
};

interface ComplaintActionModalProps {
  row: ComplaintRow;
  kind: ActionKind;
  /** 관리자가 지사를 고를 때만 쓴다. */
  groups: string[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (body: SubmitBody) => Promise<void>;
}

const ComplaintActionModal = memo(function ComplaintActionModalComponent({
  row,
  kind,
  groups,
  isSubmitting,
  onClose,
  onSubmit,
}: ComplaintActionModalProps) {
  const [group, setGroup] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState(row.handled_note ?? '');
  const [agentId, setAgentId] = useState('');

  // 설계사 목록은 그 창을 열었을 때만 받는다. 다른 동작에는 필요 없다.
  const { data: agents = [], isLoading: agentsLoading } = useComplaintAgents(
    row.assigned_group ?? undefined,
    kind === 'assign_agent'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === 'assign_dept') await onSubmit({ action: 'assign_dept', group });
    else if (kind === 'return') await onSubmit({ action: 'return', reason: reason.trim() });
    else if (kind === 'assign_agent') await onSubmit({ action: 'assign_agent', agentId: Number(agentId) });
    else await onSubmit({ action: 'handle', note: note.trim() });
  };

  const canSubmit =
    kind === 'assign_dept'
      ? !!group
      : kind === 'return'
        ? reason.trim().length > 0
        : kind === 'assign_agent'
          ? !!agentId
          : note.trim().length > 0;

  return (
    /* 배경을 눌러도 닫히지 않는다. 적던 처리 내용이 스치는 손짓에 사라지면 안 된다. */
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>{TITLE[kind]}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            <MdClose />
          </button>
        </div>

        {/* 무엇을 넘기는지 다시 보여준다. 목록에서 다른 줄을 눌렀을 때 바로 안다. */}
        <dl className={styles.modalSummary}>
          <div>
            <dt>수령인</dt>
            <dd>{row.customer_name}</dd>
          </div>
          <div>
            <dt>전화번호</dt>
            <dd>{row.phone || '-'}</dd>
          </div>
          <div>
            <dt>주문번호</dt>
            <dd>{row.order_no || '-'}</dd>
          </div>
          <div>
            <dt>통화내역</dt>
            <dd>{row.call_memo || '-'}</dd>
          </div>
        </dl>

        <form onSubmit={handleSubmit}>
          {kind === 'assign_dept' && (
            <label className={styles.modalField}>
              <span>넘길 지사</span>
              <select value={group} onChange={(e) => setGroup(e.target.value)} required>
                <option value="">지사를 고르세요</option>
                {groups.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {kind === 'return' && (
            <label className={styles.modalField}>
              <span>반려 사유</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="무엇을 고쳐야 하는지 적어 주세요."
                required
              />
            </label>
          )}

          {kind === 'assign_agent' && (
            <label className={styles.modalField}>
              <span>담당 설계사</span>
              {agentsLoading ? (
                <p className={styles.muted}>불러오는 중…</p>
              ) : agents.length === 0 ? (
                // 계정이 없으면 고를 수가 없다. 무엇을 해야 하는지 알려 준다.
                <p className={styles.muted}>
                  이 지사에 설계사 계정이 없습니다. 관리자에게 계정 생성을 요청해 주세요.
                </p>
              ) : (
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
                  <option value="">설계사를 고르세요</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name || agent.username}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {kind === 'handle' && (
            <label className={styles.modalField}>
              <span>처리 내용</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="어떻게 처리했는지 적어 주세요. 올린 민원담당자가 이 내용을 봅니다."
                required
              />
            </label>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.ghostBtn} onClick={onClose}>
              취소
            </button>
            <button
              type="submit"
              className={styles.actionBtn}
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? '처리 중…' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default ComplaintActionModal;
