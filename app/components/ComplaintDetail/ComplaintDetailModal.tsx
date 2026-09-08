'use client';

import React, { memo } from 'react';
import { MdClose } from 'react-icons/md';
import {
  COMPLAINT_STATUS_LABEL,
  ASSIGN_TYPE_LABEL,
  MATCH_KEY_LABEL,
  THREAD_MATCH_KEY,
  daysSince,
  type ComplaintRow,
} from '@/lib/complaints';
import { TRANSFER_KIND_LABEL, transferPath } from '@/lib/complaintTransfers';
import { useComplaintThread } from '@/app/hooks/useComplaints';
import styles from './ComplaintDetail.module.css';

/**
 * 민원 한 건의 모든 것.
 *
 * 목록에 열을 계속 늘리면 어느 순간 한 줄도 눈에 안 들어온다. 그래서 목록에는
 * 훑을 때 필요한 것만 두고, 나머지는 여기서 본다 — 앞으로 값이 늘어도 열이
 * 아니라 이 창이 길어진다.
 *
 * 읽기만 한다. 무엇을 하는 것은 목록의 '작업' 버튼이 맡는다.
 */

const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('ko-KR').slice(0, -1) : '-';

const dateTimeText = (value: string | null) => {
  if (!value) return '-';
  const at = new Date(value);
  const time = at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return `${at.toLocaleDateString('ko-KR').slice(0, -1)} ${time}`;
};

/** 한 줄. 값이 없으면 '-'로 두어 칸이 비어 보이지 않게 한다. */
const Line = ({ label, children }: { label: string; children?: React.ReactNode }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children ?? '-'}</dd>
  </div>
);

interface ComplaintDetailModalProps {
  row: ComplaintRow;
  isAdmin: boolean;
  onClose: () => void;
}

const ComplaintDetailModal = memo(function ComplaintDetailModalComponent({
  row,
  isAdmin,
  onClose,
}: ComplaintDetailModalProps) {
  const days = daysSince(row.created_at);
  // 서버가 순서를 보장하지 않는다. 오래된 것부터 세워야 '1차·2차'가 맞는다.
  const returns = [...(row.complaint_returns ?? [])].sort((a, b) =>
    a.returned_at.localeCompare(b.returned_at)
  );
  // 오간 이력. 서버가 순서를 보장하지 않아 오래된 것부터 세운다.
  const transfers = [...(row.complaint_transfers ?? [])].sort((a, b) => a.at.localeCompare(b.at));
  /*
   * 같은 건의 다른 회차. 묶음이 둘 이상일 때만 묻는다.
   *
   * 3차를 열었으면 1·2차에서 고객이 뭐라고 했고 우리가 뭐라고 안내했는지가
   * 같이 보여야 한다. 이 창을 여는 것이 곧 확인이라, 여기서 안 보이면 "봤다"고
   * 찍히면서 실제로는 못 본 것이 된다.
   */
  const { data: thread = [] } = useComplaintThread(row.id, (row.thread_total ?? 1) > 1);
  const unfinished = thread.filter((e) => e.status === 'branch').length;

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modal} ${styles.detailModal}`}>
        <div className={styles.modalHeader}>
          <h3>
            {row.customer_name}
            <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
              {COMPLAINT_STATUS_LABEL[row.status]}
            </span>
          </h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            <MdClose />
          </button>
        </div>

        {/* 메일로 온 원본 그대로. 순서도 메일의 표와 같게 둔다. */}
        <h4 className={styles.detailTitle}>접수 내용</h4>
        <dl className={styles.detailList}>
          <Line label="주문 대표상품">{row.product}</Line>
          <Line label="수령인">{row.customer_name}</Line>
          <Line label="전화번호">{row.phone}</Line>
          <Line label="주문번호">{row.order_no}</Line>
          <Line label="고객 접수일">{dateText(row.received_at)}</Line>
          <Line label="발주확인일">{dateText(row.order_confirmed_at)}</Line>
          <Line label="통화일시">{dateTimeText(row.called_at)}</Line>
          <Line label="통화내역">{row.call_memo}</Line>
        </dl>

        {thread.length > 1 && (
          <div className={styles.threadBox}>
            <h4>
              같은 건으로 접수된 민원 {thread.length}건
              {unfinished > 1 && (
                <span className={styles.threadNote}> · 아직 안 끝난 것 {unfinished}건</span>
              )}
            </h4>
            <ol className={styles.threadList}>
              {thread.map((entry) => (
                <li key={entry.id} className={entry.id === row.id ? styles.threadCurrent : ''}>
                  <div className={styles.threadHead}>
                    <span className={styles.threadSeq}>{entry.sequence_no}차</span>
                    <span className={styles.threadWhen}>{dateTimeText(entry.called_at)}</span>
                    {entry.id === row.id && <span className={styles.threadHere}>이번 건</span>}
                    {entry.status === 'done' && <span className={styles.threadDone}>처리 완료</span>}
                  </div>
                  <p className={styles.threadMemo}>{entry.call_memo || '(통화내역 없음)'}</p>
                  {entry.handled_note && (
                    <div className={styles.threadHandled}>
                      <span className={styles.threadHandledLabel}>이 회차 처리 내용</span>
                      <p className={styles.threadHandledBody}>{entry.handled_note}</p>
                      <span className={styles.threadWhen}>
                        {entry.handled_by} · {dateTimeText(entry.handled_at)}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        <h4 className={styles.detailTitle}>접수·전달</h4>
        <dl className={styles.detailList}>
          <Line label="민원 등록일">{dateTimeText(row.created_at)}</Line>
          <Line label="경과">{days === 0 ? '오늘 등록' : `${days}일 지남`}</Line>
          <Line label="올린 사람">{row.created_by}</Line>
          {isAdmin && (
            <>
              <Line label="담당 지사">{row.assigned_group}</Line>
              <Line label="배정 방식">
                {row.assign_type ? ASSIGN_TYPE_LABEL[row.assign_type] : null}
              </Line>
              <Line label="배정한 사람">{row.assigned_by}</Line>
              <Line label="배정 시각">
                {row.assigned_at ? dateTimeText(row.assigned_at) : null}
              </Line>
              {/*
                왜 이 지사로 갔는지. 되짚어야 할 때 시작점이 되는 값들이다.

                자동으로 찾은 건에만 있다. 관리자가 직접 지정한 건에는 찾은 근거가
                없으므로 '-'를 세 줄 늘어놓지 않고 그 사실만 한 줄로 적는다 —
                빈 줄이 늘어서 있으면 값이 빠진 것처럼 보인다.
              */}
              {row.match_key === THREAD_MATCH_KEY ? (
                /*
                  앞 민원을 따라간 건. 배포 기록에서 찾은 게 아니므로 근거
                  파일도 직전 신청일도 없다 — 앞 건의 근거를 베껴 놓으면
                  되짚을 때 이번 건이 스스로 찾아진 것처럼 보인다.
                */
                <Line label="찾은 방법">
                  <span className={styles.muted}>
                    같은 건으로 앞서 접수된 민원과 같은 지사로 보냈습니다
                  </span>
                </Line>
              ) : row.match_key ? (
                <>
                  <Line label="찾은 방법">
                    {MATCH_KEY_LABEL[row.match_key] ?? row.match_key}
                  </Line>
                  <Line label="근거 파일">{row.source_file_name}</Line>
                  {/*
                    그때 그 지사로 배정된 건의 '접수일자'다(고객이 신청한 날).
                    배정된 날이 아니다 — 이번 민원의 접수일자와 같은 축에서
                    비교해야 앞뒤가 뒤집히지 않는다(lib/lastAssignment.ts 참고).
                  */}
                  {/*
                    신청한 날과 배정된 날은 다르다 — 신청은 고객이 한 일이고
                    배정은 우리가 한 일이라 며칠 벌어진다. 되짚을 때 둘 다 필요하다.
                  */}
                  <Line label="직전 신청일">
                    {row.previous_applied_at ? dateText(row.previous_applied_at) : null}
                  </Line>
                  <Line label="직전 배정일">
                    {row.previous_assigned_at ? dateText(row.previous_assigned_at) : null}
                  </Line>
                </>
              ) : (
                row.assigned_group && (
                  <Line label="찾은 방법">
                    <span className={styles.muted}>
                      자동으로 찾지 못해 관리자가 직접 지정했습니다
                    </span>
                  </Line>
                )
              )}
            </>
          )}
        </dl>

        <h4 className={styles.detailTitle}>처리</h4>
        <dl className={styles.detailList}>
          {/*
            시각과 사람을 값에 붙이지 않고 각자 자리를 준다. 상세는 자리가
            넉넉하므로, 작은 글씨로 붙여 놓는 것보다 항목으로 세우는 편이
            "언제 누가"를 찾을 때 눈이 덜 움직인다.
          */}
          <Line label="확인 여부">
            {row.read_at ? '확인함' : <span className={styles.muted}>아직 확인하지 않음</span>}
          </Line>
          {row.read_at && (
            <>
              <Line label="확인 시각">{dateTimeText(row.read_at)}</Line>
              <Line label="확인한 사람">{row.read_by}</Line>
            </>
          )}

          <Line label="처리 내용">
            {row.handled_note ? (
              <span className={styles.detailNote}>{row.handled_note}</span>
            ) : null}
          </Line>
          {row.handled_at && (
            <>
              <Line label="처리 시각">{dateTimeText(row.handled_at)}</Line>
              <Line label="처리한 사람">{row.handled_by}</Line>
            </>
          )}
          {/* 철회. 지운 게 아니라 닫은 것이라, 누가 언제 왜 닫았는지가 여기 남는다. */}
          {row.status === 'withdrawn' && (
            <>
              <Line label="철회 시각">{dateTimeText(row.withdrawn_at)}</Line>
              <Line label="철회한 사람">{row.withdrawn_by}</Line>
              <Line label="철회 사유">
                {row.withdraw_reason ? (
                  <span className={styles.detailNote}>{row.withdraw_reason}</span>
                ) : (
                  <span className={styles.muted}>적지 않음</span>
                )}
              </Line>
            </>
          )}
        </dl>

        {/*
          보완 이력. 고쳐서 다시 보내면 위의 상태는 바뀌지만 여기 기록은 남는다 —
          몇 번 오갔고 그때마다 무엇이 문제였는지가 그 건의 사정이다.
        */}
        {returns.length > 0 && (
          <>
            <h4 className={styles.detailTitle}>보완 이력 ({returns.length}회)</h4>
            <dl className={styles.detailList}>
              {returns.map((r, at) => (
                <Line key={`${r.returned_at}-${at}`} label={`${at + 1}차 보완`}>
                  <span className={styles.detailNote}>{r.reason}</span>
                  <span className={styles.returnMeta}>
                    {dateTimeText(r.returned_at)} · {r.returned_by}
                  </span>
                </Line>
              ))}
            </dl>
          </>
        )}

        {/*
          지사를 오간 이력.
          민원 행에는 지금 지사 하나만 남아 옮기는 순간 앞의 지사가 덮인다.
          한 건이 몇 군데를 돌았고 누가 왜 되돌렸는지는 여기서만 읽힌다 —
          관리자가 다음 지사를 정할 때 같은 데로 또 보내지 않으려면 봐야 한다.
        */}
        {transfers.length > 0 && (
          <>
            <h4 className={styles.detailTitle}>지사 배정 이력 ({transfers.length}회)</h4>
            <dl className={styles.detailList}>
              {transfers.map((t, at) => (
                <Line key={`${t.at}-${at}`} label={`${at + 1}. ${TRANSFER_KIND_LABEL[t.kind]}`}>
                  <span className={styles.transferPath}>{transferPath(t)}</span>
                  {t.reason && <span className={styles.detailNote}>{t.reason}</span>}
                  <span className={styles.returnMeta}>
                    {dateTimeText(t.at)} · {t.by_name}
                  </span>
                </Line>
              ))}
            </dl>
          </>
        )}

        <div className={styles.modalActions}>
          <button type="button" className={styles.actionBtn} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
});

export default ComplaintDetailModal;
