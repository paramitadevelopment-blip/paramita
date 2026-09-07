'use client';

import React, { memo, useState } from 'react';
import { MdSend } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import { validateComplaintInput } from '@/lib/complaints';
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
  /**
   * 이 창이 무슨 일을 하는 자리인가.
   *
   * 'resubmit'은 반려돼 돌아온 건을 고쳐 다시 보내는 것이다. 하는 일이 '수정'과
   * 다르지 않아 보여도, 누르는 사람에게는 다르다 — 고쳐 놓고 끝나는 게 아니라
   * 그 순간 다시 넘어간다. 버튼이 그렇게 말해야 한다.
   */
  mode?: 'create' | 'edit' | 'resubmit';
  isSubmitting: boolean;
}

/** 버튼에 적을 말. 무엇이 일어나는지를 그대로 적는다. */
const SUBMIT_LABEL = {
  create: '민원 등록',
  edit: '수정',
  resubmit: '재요청',
} as const;

const ComplaintForm = memo(function ComplaintFormComponent({
  onSubmit,
  onCancel,
  initial,
  mode = initial ? 'edit' : 'create',
  isSubmitting,
}: ComplaintFormProps) {
  const { showAlert } = useAlert();
  const [form, setForm] = useState<ComplaintInput>(initial ?? EMPTY);

  const set = (key: keyof ComplaintInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // 치는 대로 하이픈을 넣어 준다. 자릿수가 눈에 보여야 한 자리 빠뜨린 걸 안다.
  const setPhone = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, phone: formatPhone(e.target.value) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    /*
     * 브라우저 기본 말풍선 대신 이 앱의 알림 창으로 알린다. 기본 말풍선은
     * 창 안에서 위치가 어긋나고, 다른 화면의 오류 안내와 모양이 달라 같은
     * 시스템으로 안 보인다. 검사 규칙은 서버와 같은 함수를 쓴다.
     */
    const error = validateComplaintInput(form as unknown as Record<string, unknown>);
    if (error) {
      showAlert({ type: 'warning', title: '입력 확인', message: error });
      return;
    }

    await onSubmit(form);
    // 성공했을 때만 비운다. 실패한 입력을 지우면 메일을 다시 보고 옮겨 적어야 한다.
    // 고치는 중이면 비우지 않는다 — 창이 닫히므로 비울 것도 없다.
    if (!initial) setForm(EMPTY);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span>
            주문 대표상품 <b className={styles.required}>*</b>
          </span>
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
          />
        </label>

        <label className={styles.field}>
          <span>
            전화번호 <b className={styles.required}>*</b>
          </span>
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
          <span>
            주문번호 <b className={styles.required}>*</b>
          </span>
          <input
            type="text"
            value={form.orderNo}
            onChange={set('orderNo')}
            maxLength={50}
          />
        </label>

        <label className={styles.field}>
          <span>
            접수일자 <b className={styles.required}>*</b>
          </span>
          <input type="date" value={form.receivedAt} onChange={set('receivedAt')} />
        </label>

        <label className={styles.field}>
          <span>
            발주확인일 <b className={styles.required}>*</b>
          </span>
          <input
            type="date"
            value={form.orderConfirmedAt}
            onChange={set('orderConfirmedAt')}
          />
        </label>

        <label className={styles.field}>
          <span>
            통화일시 <b className={styles.required}>*</b>
          </span>
          <input
            type="datetime-local"
            value={form.calledAt}
            onChange={set('calledAt')}
          />
        </label>
      </div>

      <label className={`${styles.field} ${styles.memoField}`}>
        <span>
          통화내역 <b className={styles.required}>*</b>
        </span>
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
          {isSubmitting ? '저장 중…' : SUBMIT_LABEL[mode]}
        </button>
      </div>
    </form>
  );
});

export default ComplaintForm;
