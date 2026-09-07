'use client';

import React, { memo, useState } from 'react';
import { MdClose, MdSearch, MdSend, MdLock } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import { useGiftLookup } from '@/app/hooks/useGifts';
import { validateGiftInput, type GiftEditableFields, type GiftRequestRow } from '@/lib/gifts';
import { formatPhone } from '@/lib/phoneFormat';
import styles from './GiftRequest.module.css';

/**
 * 사은품 신청서.
 *
 * 주문번호를 치고 [조회]를 누르면 배포 기록에서 고객을 찾아 아래 칸을 채운다.
 * 고객명·전화번호는 잠긴다 — 사은품이 엉뚱한 사람에게 가는 사고는 대개
 * 이름과 번호를 손으로 옮겨 적다 생긴다. 나머지는 고칠 수 있다.
 *
 * 칸 순서는 발주리스트 엑셀의 열 순서를 따른다. 사은품담당자가 그 엑셀로
 * 옮겨 적어 발주하므로, 같은 순서여야 눈이 덜 움직인다.
 */

const EMPTY: GiftEditableFields = {
  zip: '',
  address: '',
  deliveryMemo: '',
  giftName: '',
  quantity: 1,
  note: '',
  senderName: '',
  senderPhone: '',
  product: '',
  customerNo: '',
  counselor: '',
  settlement: '',
};

interface Locked {
  customerName: string;
  phone1: string;
  phone2: string;
}

interface GiftRequestFormModalProps {
  /** 고칠 때. 없으면 새로 넣는 것이다. */
  editing?: GiftRequestRow;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (input: { orderNo: string } & GiftEditableFields) => Promise<unknown>;
}

const TITLE = {
  create: '사은품 신청',
  edit: '신청 내용 수정',
  resubmit: '보완 후 다시 올리기',
} as const;

const SUBMIT_LABEL = {
  create: '신청',
  edit: '수정',
  resubmit: '다시 올리기',
} as const;

const GiftRequestFormModal = memo(function GiftRequestFormModalComponent({
  editing,
  isSubmitting,
  onClose,
  onSubmit,
}: GiftRequestFormModalProps) {
  const { showAlert } = useAlert();
  const lookup = useGiftLookup();

  const mode = !editing ? 'create' : editing.status === 'supplement' ? 'resubmit' : 'edit';

  const [orderNo, setOrderNo] = useState(editing?.order_no ?? '');
  const [locked, setLocked] = useState<Locked | null>(
    editing
      ? { customerName: editing.customer_name, phone1: editing.phone1 ?? '', phone2: editing.phone2 ?? '' }
      : null
  );
  const [form, setForm] = useState<GiftEditableFields>(
    editing
      ? {
          zip: editing.zip ?? '',
          address: editing.address ?? '',
          deliveryMemo: editing.delivery_memo ?? '',
          giftName: editing.gift_name,
          quantity: editing.quantity,
          note: editing.note ?? '',
          senderName: editing.sender_name ?? '',
          senderPhone: editing.sender_phone ?? '',
          product: editing.product ?? '',
          customerNo: editing.customer_no ?? '',
          counselor: editing.counselor ?? '',
          settlement: editing.settlement ?? '',
        }
      : EMPTY
  );
  const [hint, setHint] = useState<{ ok: boolean; text: string } | null>(null);

  const set =
    (key: keyof GiftEditableFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleLookup = async () => {
    const value = orderNo.trim();
    if (!value) {
      showAlert({ type: 'warning', title: '입력 확인', message: '주문번호를 입력해 주세요.' });
      return;
    }
    try {
      const found = await lookup.mutateAsync(value);
      setLocked(found.locked);
      setForm(found.fields);
      setHint({ ok: true, text: `${found.locked.customerName} 님 — 기록에서 찾았습니다. 아래 칸을 확인하고 채워 주세요.` });
    } catch (err) {
      setLocked(null);
      setForm(EMPTY);
      setHint({ ok: false, text: (err as Error).message });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locked) {
      showAlert({ type: 'warning', title: '고객 확인', message: '먼저 주문번호를 조회해 고객을 찾아 주세요.' });
      return;
    }
    const error = validateGiftInput({ ...form, orderNo });
    if (error) {
      showAlert({ type: 'warning', title: '입력 확인', message: error });
      return;
    }
    await onSubmit({ orderNo: orderNo.trim(), ...form });
  };

  return (
    /* 배경을 눌러도 닫히지 않는다. 열여덟 칸을 적다 스치는 손짓에 사라지면 안 된다. */
    <div className={styles.modalOverlay}>
      <div className={`${styles.modal} ${styles.wideModal}`}>
        <div className={styles.modalHeader}>
          <h3>{TITLE[mode]}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            <MdClose />
          </button>
        </div>

        {mode === 'resubmit' && editing?.supplement_reason && (
          <div className={styles.threadBox}>
            <h4>보완 요청 사유</h4>
            <p className={styles.threadMemo}>{editing.supplement_reason}</p>
            <span className={styles.threadWhen}>{editing.supplement_by}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 주문번호. 고칠 때는 바꿀 수 없다 — 고객이 바뀌는 일이라 새로 넣는다. */}
          <div className={styles.lookupRow}>
            <label className={styles.modalField}>
              <span>주문번호</span>
              <input
                type="text"
                value={orderNo}
                onChange={(e) => setOrderNo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !editing) {
                    e.preventDefault();
                    handleLookup();
                  }
                }}
                placeholder="배포된 고객의 주문번호"
                disabled={!!editing}
                maxLength={50}
                autoFocus={!editing}
              />
            </label>
            {!editing && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={handleLookup}
                disabled={lookup.isPending}
              >
                <MdSearch />
                {lookup.isPending ? '찾는 중…' : '조회'}
              </button>
            )}
          </div>
          {hint && <p className={`${styles.lookupHint} ${hint.ok ? styles.ok : styles.bad}`}>{hint.text}</p>}

          <div className={styles.formSection}>고객 — 기록에서 가져온 값이라 고칠 수 없습니다</div>
          <div className={styles.formGrid}>
            <label className={`${styles.modalField} ${styles.lockedField}`}>
              <span>
                고객명 <MdLock className={styles.lockedTag} />
              </span>
              <input type="text" value={locked?.customerName ?? ''} readOnly tabIndex={-1} />
            </label>
            <label className={`${styles.modalField} ${styles.lockedField}`}>
              <span>
                전화번호1 <MdLock className={styles.lockedTag} />
              </span>
              <input type="text" value={locked?.phone1 ?? ''} readOnly tabIndex={-1} />
            </label>
            <label className={`${styles.modalField} ${styles.lockedField}`}>
              <span>
                전화번호2 <MdLock className={styles.lockedTag} />
              </span>
              <input type="text" value={locked?.phone2 ?? ''} readOnly tabIndex={-1} />
            </label>
            <label className={styles.modalField}>
              <span>우편번호</span>
              <input type="text" value={form.zip} onChange={set('zip')} maxLength={10} />
            </label>
            <label className={`${styles.modalField} ${styles.full}`}>
              <span>
                주소 <b className={styles.required}>*</b>
              </span>
              <input type="text" value={form.address} onChange={set('address')} maxLength={300} />
            </label>
            <label className={`${styles.modalField} ${styles.full}`}>
              <span>배송메세지</span>
              <input
                type="text"
                value={form.deliveryMemo}
                onChange={set('deliveryMemo')}
                placeholder="부재 시 문 앞에 두세요"
                maxLength={300}
              />
            </label>
          </div>

          <div className={styles.formSection}>사은품</div>
          <div className={styles.formGrid}>
            <label className={styles.modalField}>
              <span>
                사은품명 <b className={styles.required}>*</b>
              </span>
              <input type="text" value={form.giftName} onChange={set('giftName')} maxLength={100} />
            </label>
            <label className={styles.modalField}>
              <span>
                수량 <b className={styles.required}>*</b>
              </span>
              <input
                type="number"
                min={1}
                max={99}
                value={form.quantity}
                onChange={(e) => setForm((prev) => ({ ...prev, quantity: Number(e.target.value) }))}
              />
            </label>
            <label className={`${styles.modalField} ${styles.full}`}>
              <span>비고</span>
              <input type="text" value={form.note} onChange={set('note')} maxLength={500} />
            </label>
          </div>

          <div className={styles.formSection}>보내는 곳</div>
          <div className={styles.formGrid}>
            <label className={styles.modalField}>
              <span>
                보내시는분 <b className={styles.required}>*</b>
              </span>
              <input type="text" value={form.senderName} onChange={set('senderName')} maxLength={50} />
            </label>
            <label className={styles.modalField}>
              <span>
                보내시는분 연락처 <b className={styles.required}>*</b>
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={form.senderPhone}
                onChange={(e) => setForm((prev) => ({ ...prev, senderPhone: formatPhone(e.target.value) }))}
                placeholder="010-0000-0000"
                maxLength={14}
              />
            </label>
          </div>

          <div className={styles.formSection}>상품·정산</div>
          <div className={styles.formGrid}>
            <label className={`${styles.modalField} ${styles.full}`}>
              <span>
                상품명(방송사) <b className={styles.required}>*</b>
              </span>
              <input type="text" value={form.product} onChange={set('product')} maxLength={200} />
            </label>
            <label className={styles.modalField}>
              <span>고객번호</span>
              <input type="text" value={form.customerNo} onChange={set('customerNo')} maxLength={50} />
            </label>
            <label className={styles.modalField}>
              <span>상담원</span>
              <input type="text" value={form.counselor} onChange={set('counselor')} maxLength={50} />
            </label>
            <label className={styles.modalField}>
              <span>정산구분</span>
              <input
                type="text"
                value={form.settlement}
                onChange={set('settlement')}
                placeholder="정산해당"
                maxLength={30}
              />
            </label>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.ghostBtn} onClick={onClose}>
              취소
            </button>
            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isSubmitting || !locked}
            >
              <MdSend />
              {isSubmitting ? '저장 중…' : SUBMIT_LABEL[mode]}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

export default GiftRequestFormModal;
