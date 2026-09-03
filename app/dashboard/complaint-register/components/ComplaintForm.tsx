'use client';

import React, { memo, useState } from 'react';
import { MdSend } from 'react-icons/md';
import { formatPhone } from '@/lib/phoneFormat';
import type { ComplaintInput } from '@/app/hooks/useComplaints';
import styles from '../page.module.css';

/**
 * 민원 접수 입력.
 *
 * 메일로 오는 표의 칸을 그대로 옮겨 놓았다 — 순서까지 같게 둔 이유는, 넣는
 * 사람이 메일을 보면서 위에서 아래로 훑어 적기 때문이다. 칸 순서가 다르면
 * 시선이 계속 왔다 갔다 한다.
 */

const EMPTY: ComplaintInput = {
  product: '',
  customerName: '',
  phone: '',
  receivedAt: '',
  orderConfirmedAt: '',
  callMemo: '',
  orderNo: '',
  calledAt: '',
};

interface ComplaintFormProps {
  onSubmit: (input: ComplaintInput) => Promise<unknown>;
  /** 창으로 열렸을 때 닫는 자리. 창이 아니면 없다. */
  onCancel?: () => void;
  /** 고칠 때 채워 둘 값. 새로 넣을 때는 없다. */
  initial?: ComplaintInput;
  isSubmitting: boolean;
}

const ComplaintForm = memo(function ComplaintFormComponent({
  onSubmit,
  onCancel,
  initial,
  isSubmitting,
}: ComplaintFormProps) {
  const [form, setForm] = useState<ComplaintInput>(initial ?? EMPTY);

  const set = (key: keyof ComplaintInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // 치는 대로 하이픈을 넣어 준다. 자릿수가 눈에 보여야 한 자리 빠뜨린 걸 안다.
  const setPhone = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, phone: formatPhone(e.target.value) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(form);
    // 성공했을 때만 비운다. 실패한 입력을 지우면 메일을 다시 보고 옮겨 적어야 한다.
    // 고치는 중이면 비우지 않는다 — 창이 닫히므로 비울 것도 없다.
    if (!initial) setForm(EMPTY);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>주문 대표상품</span>
          <input
            type="text"
            value={form.product}
            onChange={set('product')}
            placeholder="흥국화재(든든한3N5)_상담예약(보관에어프라이어)"
            maxLength={200}
          />
        </label>

        <label className={styles.field}>
          <span>
            수령인 이름 <b className={styles.required}>*</b>
          </span>
          <input
            type="text"
            value={form.customerName}
            onChange={set('customerName')}
            maxLength={50}
            required
          />
        </label>

        <label className={styles.field}>
          <span>전화번호</span>
          <input
            type="text"
            inputMode="numeric"
            value={form.phone}
            onChange={setPhone}
            placeholder="010-0000-0000"
            maxLength={14}
          />
        </label>

        <label className={styles.field}>
          <span>주문번호</span>
          <input type="text" value={form.orderNo} onChange={set('orderNo')} maxLength={50} />
        </label>

        <label className={styles.field}>
          <span>접수일자</span>
          <input type="date" value={form.receivedAt} onChange={set('receivedAt')} />
        </label>

        <label className={styles.field}>
          <span>발주확인일</span>
          <input
            type="date"
            value={form.orderConfirmedAt}
            onChange={set('orderConfirmedAt')}
          />
        </label>

        <label className={styles.field}>
          <span>통화일시</span>
          <input type="datetime-local" value={form.calledAt} onChange={set('calledAt')} />
        </label>
      </div>

      <label className={`${styles.field} ${styles.memoField}`}>
        <span>통화내역</span>
        <textarea
          value={form.callMemo}
          onChange={set('callMemo')}
          rows={3}
          maxLength={2000}
          placeholder="사은품 배송일정 확인후 연락요청"
        />
      </label>

      <div className={styles.formActions}>
        {onCancel && (
          <button type="button" className={styles.ghostBtn} onClick={onCancel}>
            취소
          </button>
        )}
        <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
          <MdSend />
          {isSubmitting ? '저장 중…' : initial ? '수정' : '민원 등록'}
        </button>
      </div>
    </form>
  );
});

export default ComplaintForm;
