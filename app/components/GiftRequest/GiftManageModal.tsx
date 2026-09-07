'use client';

import React, { memo, useState } from 'react';
import { MdClose } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import { validateShipInput, type GiftRequestRow, type GiftShipInput } from '@/lib/gifts';
import styles from './GiftRequest.module.css';

/**
 * 사은품담당자의 두 동작 — 발주와 보완 요청.
 *
 * 둘 다 "어느 고객의 어떤 사은품인가"를 다시 확인하고 몇 칸만 적는 모양이라
 * 한 창에 둔다. 창을 둘로 나누면 같은 껍데기가 둘이 된다.
 */

export type ManageKind = 'ship' | 'supplement';

type SubmitBody = ({ action: 'ship' } & GiftShipInput) | { action: 'supplement'; reason: string };

const TITLE: Record<ManageKind, string> = {
  ship: '발주 · 배송 정보 입력',
  supplement: '보완 요청',
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface GiftManageModalProps {
  row: GiftRequestRow;
  kind: ManageKind;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (body: SubmitBody) => Promise<void>;
}

const GiftManageModal = memo(function GiftManageModalComponent({
  row,
  kind,
  isSubmitting,
  onClose,
  onSubmit,
}: GiftManageModalProps) {
  const { showAlert } = useAlert();
  // 발주하는 날이 곧 발주일인 경우가 대부분이다. 다른 날이면 고친다.
  const [orderDate, setOrderDate] = useState(row.order_date ?? today());
  const [courier, setCourier] = useState(row.courier ?? '');
  const [trackingNo, setTrackingNo] = useState(row.tracking_no ?? '');
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === 'ship') {
      const error = validateShipInput({ orderDate, courier, trackingNo });
      if (error) {
        showAlert({ type: 'warning', title: '입력 확인', message: error });
        return;
      }
      await onSubmit({ action: 'ship', orderDate, courier: courier.trim(), trackingNo: trackingNo.trim() });
    } else {
      if (!reason.trim()) {
        showAlert({ type: 'warning', title: '입력 확인', message: '보완 사유를 적어 주세요.' });
        return;
      }
      await onSubmit({ action: 'supplement', reason: reason.trim() });
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>{TITLE[kind]}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            <MdClose />
          </button>
        </div>

        {/* 무엇을 다루는지 다시 보여준다. 목록에서 다른 줄을 눌렀을 때 바로 안다. */}
        <dl className={styles.modalSummary}>
          <div>
            <dt>고객명</dt>
            <dd>{row.customer_name}</dd>
          </div>
          <div>
            <dt>사은품</dt>
            <dd>
              {row.gift_name} × {row.quantity}
            </dd>
          </div>
          <div>
            <dt>주소</dt>
            <dd>{row.address || '-'}</dd>
          </div>
          <div>
            <dt>신청</dt>
            <dd>
              {row.group_name} · {row.requester_name}
            </dd>
          </div>
        </dl>

        <form onSubmit={handleSubmit}>
          {kind === 'ship' ? (
            <>
              <label className={styles.modalField}>
                <span>발주일</span>
                <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} required />
              </label>
              <label className={styles.modalField}>
                <span>택배사</span>
                <input
                  type="text"
                  value={courier}
                  onChange={(e) => setCourier(e.target.value)}
                  placeholder="CJ대한통운"
                  maxLength={50}
                  required
                />
              </label>
              <label className={styles.modalField}>
                <span>운송장번호</span>
                <input
                  type="text"
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                  maxLength={50}
                  required
                />
              </label>
            </>
          ) : (
            <label className={styles.modalField}>
              <span>보완 사유</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="무엇을 고쳐야 하는지 적어 주세요. 신청한 설계사가 이 내용을 보고 고칩니다."
                required
              />
            </label>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.ghostBtn} onClick={onClose}>
              취소
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? '저장 중…' : kind === 'ship' ? '발주 완료' : '보완 요청'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default GiftManageModal;
