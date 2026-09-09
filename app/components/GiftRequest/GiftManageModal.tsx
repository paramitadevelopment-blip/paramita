'use client';

import React, { memo, useState } from 'react';
import { MdClose } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import { validateShipInput, type GiftRequestRow, type GiftShipInput } from '@/lib/gifts';
import styles from './GiftRequest.module.css';

/**
 * 사은품담당자의 두 동작 — 배송 정보 입력과 보완 요청.
 *
 * 둘 다 "어느 고객의 어떤 사은품인가"를 다시 확인하고 몇 칸만 적는 모양이라
 * 한 창에 둔다. 창을 둘로 나누면 같은 껍데기가 둘이 된다.
 *
 * 배송 정보는 택배사·운송장번호가 본체다. 발주일은 발주리스트를 만들 때 이미
 * 찍혀 있고, 거래처가 실제로 내보낸 날이 다르면 여기서 고친다. 배송메세지는
 * 신청 때 안 적었어도 송장을 넣으며 함께 붙일 수 있다.
 *
 * 저장하면 지사의 확인이 다시 필요해진다 — 바뀐 값을 지사가 봐야 한다.
 */

export type ManageKind = 'ship' | 'supplement';

type SubmitBody = ({ action: 'ship' } & GiftShipInput) | { action: 'supplement'; reason: string };

const TITLE: Record<ManageKind, string> = {
  ship: '배송 정보 입력',
  supplement: '보완 요청',
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
  const [courier, setCourier] = useState(row.courier ?? '');
  const [trackingNo, setTrackingNo] = useState(row.tracking_no ?? '');
  const [orderDate, setOrderDate] = useState(row.order_date ?? '');
  const [deliveryMemo, setDeliveryMemo] = useState(row.delivery_memo ?? '');
  const [reason, setReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind === 'ship') {
      const error = validateShipInput({ courier, trackingNo, orderDate, deliveryMemo });
      if (error) {
        showAlert({ type: 'warning', title: '입력 확인', message: error });
        return;
      }
      await onSubmit({
        action: 'ship',
        courier: courier.trim(),
        trackingNo: trackingNo.trim(),
        orderDate: orderDate.trim(),
        deliveryMemo: deliveryMemo.trim(),
      });
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
          {row.order_id && (
            <div>
              <dt>발주</dt>
              <dd>
                #{row.order_id} · {row.order_date || '-'}
              </dd>
            </div>
          )}
        </dl>

        {/*
          발주 보냄 상태에서 되돌리면 그 건은 묶음에서 빠진다. 나머지 건은
          그대로 간다. 담당자가 그걸 알고 눌러야 한다.
        */}
        {kind === 'supplement' && row.status === 'ordered' && (
          <p className={styles.fieldHint}>
            이 건은 발주 #{row.order_id}에 담겨 나갔습니다. 보완을 요청하면 그 묶음에서 빠지고,
            고쳐서 올라오면 다음 발주리스트에 실립니다.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          {kind === 'ship' ? (
            <>
              <label className={styles.modalField}>
                <span>택배사</span>
                <input
                  type="text"
                  value={courier}
                  onChange={(e) => setCourier(e.target.value)}
                  placeholder="CJ대한통운"
                  maxLength={50}
                  required
                  autoFocus
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
              <label className={styles.modalField}>
                <span>발주일</span>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </label>
              <label className={styles.modalField}>
                <span>배송메세지</span>
                <input
                  type="text"
                  value={deliveryMemo}
                  onChange={(e) => setDeliveryMemo(e.target.value)}
                  placeholder="부재 시 경비실에 맡겨 주세요"
                  maxLength={300}
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
                placeholder="무엇을 고쳐야 하는지 적어 주세요. 신청한 지사가 이 내용을 보고 고칩니다."
                required
                autoFocus
              />
            </label>
          )}

          <div className={styles.modalActions}>
            <button type="button" className={styles.ghostBtn} onClick={onClose}>
              취소
            </button>
            <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? '저장 중…' : kind === 'ship' ? '저장' : '보완 요청'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default GiftManageModal;
