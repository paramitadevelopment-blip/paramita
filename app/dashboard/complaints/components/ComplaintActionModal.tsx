'use client';

import React, { memo, useState } from 'react';
import { MdClose, MdExpandMore } from 'react-icons/md';
import { useComplaintAgents, useComplaintThread } from '@/app/hooks/useComplaints';
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

/** '9. 3. 14:05' — 지난 민원을 훑을 때는 연도까지 필요하지 않다. */
const callText = (value: string | null) => {
  if (!value) return '-';
  const at = new Date(value);
  return `${at.toLocaleDateString('ko-KR').slice(0, -1)} ${at.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

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
  /*
   * 지난 민원을 읽었다는 표시.
   *
   * 접어 두면 아무도 안 펼치고, 안내만 띄우면 아무도 안 읽는다. 저장 버튼을
   * 잠그는 것 말고는 "읽게 하는" 방법이 없다. 처음 들어온 건에는 없는 절차다.
   */
  const [readPast, setReadPast] = useState(false);

  /*
   * 같은 건의 지난 민원. 처리할 때만 받는다.
   *
   * 처리하는 사람은 "지난번엔 뭐라고 하셨고 우리는 뭐라고 안내했나"를 보고
   * 이어서 대응해야 한다. 모르고 같은 안내를 되풀이하면 고객은 다음 민원을 넣는다.
   */
  const { data: thread = [] } = useComplaintThread(row.id, kind === 'handle');
  /*
   * 이번 건을 빼지 않고 묶음 전체를 시간순으로 낸다.
   *
   * 아직 안 끝난 회차가 여럿일 수 있다 — 1차를 처리하기도 전에 2차가 들어오는
   * 일은 흔하다. 그때 목록에서 1차를 눌렀다면 2차는 '지난 민원'이 아니라
   * 나중에 온 것이다. 자기 것을 빼고 '지난 민원'이라 부르면 순서가 뒤집혀 보인다.
   * 전부 시간순으로 세우고 이번 건이 어디인지만 짚어 주는 편이 읽기 쉽다.
   */
  const others = thread.filter((entry) => entry.id !== row.id).length;
  const unfinished = thread.filter((e) => e.status === 'branch' || e.status === 'agent').length;

  // 설계사 목록은 그 창을 열었을 때만 받는다. 다른 동작에는 필요 없다.
  const { data: agents = [], isLoading: agentsLoading } = useComplaintAgents(
    row.assigned_group ?? undefined,
    kind === 'assign_agent',
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === 'assign_dept') await onSubmit({ action: 'assign_dept', group });
    else if (kind === 'return') await onSubmit({ action: 'return', reason: reason.trim() });
    else if (kind === 'assign_agent')
      await onSubmit({ action: 'assign_agent', agentId: Number(agentId) });
    else await onSubmit({ action: 'handle', note: note.trim() });
  };

  const canSubmit =
    kind === 'assign_dept'
      ? !!group
      : kind === 'return'
        ? reason.trim().length > 0
        : kind === 'assign_agent'
          ? !!agentId
          : note.trim().length > 0 && (others === 0 || readPast);

  return (
    /* 배경을 눌러도 닫히지 않는다. 적던 처리 내용이 스치는 손짓에 사라지면 안 된다. */
    <div className={styles.modalOverlay}>
      <div className={`${styles.modal} ${kind === 'handle' ? styles.wideModal : ''}`}>
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
              {/* 화살표는 다른 화면과 같이 react-icons 를 쓴다. */}
              <div className={styles.selectWrapper}>
                <select value={group} onChange={(e) => setGroup(e.target.value)} required>
                  <option value="">지사를 고르세요</option>
                  {groups.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <MdExpandMore className={styles.selectIcon} />
              </div>
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
                <div className={styles.selectWrapper}>
                  <select value={agentId} onChange={(e) => setAgentId(e.target.value)} required>
                    <option value="">설계사를 고르세요</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name || agent.username}
                      </option>
                    ))}
                  </select>
                  <MdExpandMore className={styles.selectIcon} />
                </div>
              )}
            </label>
          )}

          {/*
            지난 민원을 접지 않고 그대로 펼친다. 접어 두면 아무도 안 펼친다.
            지난 처리 내용까지 함께 낸다 — 이미 처리했는데 또 들어왔다면
            그때 안내가 통하지 않았다는 뜻이라, 같은 말을 되풀이하면 안 된다.
          */}
          {kind === 'handle' && others > 0 && (
            <div className={styles.threadBox}>
              <h4>
                같은 건으로 접수된 민원 {thread.length}건
                {unfinished > 1 && (
                  <span className={styles.threadNote}> · 아직 안 끝난 것 {unfinished}건</span>
                )}
              </h4>
              <ol className={styles.threadList}>
                {thread.map((entry) => (
                  <li
                    key={entry.id}
                    className={entry.id === row.id ? styles.threadCurrent : ''}
                  >
                    <div className={styles.threadHead}>
                      <span className={styles.threadSeq}>{entry.sequence_no}차</span>
                      <span className={styles.threadWhen}>{callText(entry.called_at)}</span>
                      {/* 어느 것이 지금 누른 건인지. 순서가 뒤섞여 보이지 않게 한다. */}
                      {entry.id === row.id && <span className={styles.threadHere}>이번 건</span>}
                      {entry.status === 'done' && <span className={styles.threadDone}>처리 완료</span>}
                    </div>
                    <p className={styles.threadMemo}>{entry.call_memo || '(통화내역 없음)'}</p>
                    {entry.handled_note && (
                      /*
                        고객이 한 말(위)과 우리가 한 답(아래)을 한 줄에 붙이면
                        어디까지가 누구 말인지 흐려진다. 제목을 따로 세우고
                        내용을 아래로 내린다.
                      */
                      <div className={styles.threadHandled}>
                        <span className={styles.threadHandledLabel}>이 회차 처리 내용</span>
                        <p className={styles.threadHandledBody}>{entry.handled_note}</p>
                        <span className={styles.threadWhen}>
                          {entry.handled_by} · {callText(entry.handled_at)}
                        </span>
                      </div>
                    )}
                  </li>
                ))}
              </ol>

              <label className={styles.threadCheck}>
                <input
                  type="checkbox"
                  checked={readPast}
                  onChange={(e) => setReadPast(e.target.checked)}
                />
                위 {thread.length}건을 모두 확인했습니다
              </label>
            </div>
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
              {unfinished > 1 && (
                <span className={styles.fieldHint}>
                  저장하면 아직 안 끝난 {unfinished}건이 함께 처리 완료됩니다.
                </span>
              )}
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
