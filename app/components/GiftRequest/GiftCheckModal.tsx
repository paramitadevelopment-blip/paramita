'use client';

import React, { memo, useState } from 'react';
import { MdClose, MdVerified, MdUndo } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import { useGiftThread } from '@/app/hooks/useGifts';
import { GIFT_STATUS_LABEL, type GiftRequestRow } from '@/lib/gifts';
import Spinner from '@/app/components/Spinner/Spinner';
import styles from './GiftRequest.module.css';

/**
 * 재신청 확인 창.
 *
 * 관리자가 판정하는 것은 "이 고객에게 또 보내도 되는가"다. 그러려면 **그
 * 주문번호로 지금까지 무엇이 나갔는지**를 봐야 한다 — 이번 건만 보고는 두
 * 번째인지 세 번째인지, 지난번에 뭘 보냈는지도 모른다. 그래서 같은 주문번호로
 * 들어온 것을 전부 시간순으로 세우고 이번 건이 어디인지만 짚어 준다.
 *
 * 민원의 처리 창(ComplaintActionModal)과 같은 모양이다 — 중복으로 들어온 것을
 * 묶어 보여주고 그 자리에서 결정하는 자리라는 점이 같다.
 */

const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('ko-KR').slice(0, -1) : '-';

interface GiftCheckModalProps {
  row: GiftRequestRow;
  isBusy: boolean;
  onClose: () => void;
  onCheck: () => Promise<void>;
  onSupplement: (reason: string) => Promise<void>;
}

const GiftCheckModal = memo(function GiftCheckModalComponent({
  row,
  isBusy,
  onClose,
  onCheck,
  onSupplement,
}: GiftCheckModalProps) {
  const { showAlert } = useAlert();
  const { data: thread = [], isLoading } = useGiftThread(row.id);
  const [reason, setReason] = useState('');
  const [returning, setReturning] = useState(false);

  // 철회는 없던 일이라 "몇 번째"에서 뺀다. 보이기는 한다 — 그때 왜 접었는지가 판단에 든다.
  const alive = thread.filter((e) => e.status !== 'withdrawn');
  const seq = alive.findIndex((e) => e.id === row.id) + 1;

  const handleSupplement = async () => {
    if (!reason.trim()) {
      showAlert({ type: 'warning', title: '입력 확인', message: '보완 사유를 적어 주세요.' });
      return;
    }
    await onSupplement(reason.trim());
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modal} ${styles.wideModal}`}>
        <div className={styles.modalHeader}>
          <h3>재신청 확인</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            <MdClose />
          </button>
        </div>

        <dl className={styles.modalSummary}>
          <div>
            <dt>고객명</dt>
            <dd>{row.customer_name}</dd>
          </div>
          <div>
            <dt>주문번호</dt>
            <dd>{row.order_no}</dd>
          </div>
          <div>
            <dt>지사</dt>
            <dd>
              {row.group_name} · {row.requester_name}
            </dd>
          </div>
          <div>
            <dt>이번 신청</dt>
            <dd>
              {row.gift_name} × {row.quantity}
            </dd>
          </div>
        </dl>

        {/* 같은 주문번호로 들어온 것 전부. 이번 건이 몇 번째인지가 여기서 읽힌다. */}
        {isLoading ? (
          <Spinner />
        ) : (
          <div className={styles.threadBox}>
            <h4>
              이 주문번호로 들어온 신청 {alive.length}건
              {seq > 0 && <span className={styles.threadNote}> · 이번 건이 {seq}번째</span>}
            </h4>
            <ol className={styles.threadList}>
              {thread.map((entry) => (
                <li key={entry.id} className={entry.id === row.id ? styles.threadCurrent : ''}>
                  <div className={styles.threadHead}>
                    <span className={styles.threadSeq}>{entry.gift_name}</span>
                    <span className={styles.threadWhen}>× {entry.quantity}</span>
                    <span className={styles.threadWhen}>{dateText(entry.created_at)}</span>
                    <span className={styles.threadWhen}>{entry.requester_name}</span>
                    <span className={`${styles.statusBadge} ${styles[`status_${entry.status}`]}`}>
                      {GIFT_STATUS_LABEL[entry.status]}
                    </span>
                    {entry.id === row.id && <span className={styles.threadHere}>이번 건</span>}
                    {entry.order_id && (
                      <span className={styles.orderTag}>발주 #{entry.order_id}</span>
                    )}
                  </div>
                  {/* 그때 어디로 보냈나. 이사했으면 이번 주소와 다르다. */}
                  <p className={styles.threadMemo}>{entry.address || '(주소 없음)'}</p>
                  {entry.tracking_no && (
                    <div className={styles.threadHandled}>
                      <span className={styles.threadHandledLabel}>배송</span>
                      <p className={styles.threadHandledBody}>
                        {[entry.courier, entry.tracking_no].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  )}
                  {entry.check_reason && (
                    <div className={styles.threadHandled}>
                      <span className={styles.threadHandledLabel}>신청 사유</span>
                      <p className={styles.threadHandledBody}>{entry.check_reason}</p>
                    </div>
                  )}
                  {entry.supplement_reason && (
                    <div className={styles.threadHandled}>
                      <span className={styles.threadHandledLabel}>보완 사유</span>
                      <p className={styles.threadHandledBody}>{entry.supplement_reason}</p>
                    </div>
                  )}
                  {entry.status === 'withdrawn' && (
                    <div className={styles.threadHandled}>
                      <span className={styles.threadHandledLabel}>철회 사유</span>
                      <p className={styles.threadHandledBody}>
                        {entry.withdraw_reason || '적지 않음'}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 되돌릴 때만 사유 칸을 낸다. 늘 펼쳐 두면 확인하러 온 사람이 매번 지나친다. */}
        {returning && (
          <label className={styles.modalField}>
            <span>보완 사유</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="무엇이 모자란지 적어 주세요. 신청한 지사가 이 내용을 보고 고칩니다."
              autoFocus
            />
          </label>
        )}

        <div className={styles.modalActions}>
          <button type="button" className={styles.ghostBtn} onClick={onClose} disabled={isBusy}>
            닫기
          </button>
          {returning ? (
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handleSupplement}
              disabled={isBusy}
            >
              <MdUndo />
              보완 요청
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => setReturning(true)}
                disabled={isBusy}
              >
                <MdUndo />
                보완 요청
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={onCheck}
                disabled={isBusy}
              >
                <MdVerified />
                확인 — 담당자에게 보냄
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default GiftCheckModal;
