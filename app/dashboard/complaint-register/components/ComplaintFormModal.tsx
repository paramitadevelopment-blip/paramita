'use client';

import React, { memo } from 'react';
import { MdClose } from 'react-icons/md';
import type { ComplaintInput } from '@/app/hooks/useComplaints';
import ComplaintForm from './ComplaintForm';
import styles from '../page.module.css';

/**
 * 민원 접수 창.
 *
 * 입력 칸을 목록 위에 늘어놓지 않고 창으로 뺐다. 이 화면에서 오래 하는 일은
 * "내가 넣은 건이 어떻게 됐나"를 보는 것이고, 넣는 건 가끔이다. 늘 펼쳐 두면
 * 볼 때마다 빈 칸을 지나쳐 스크롤해야 한다.
 */

interface ComplaintFormModalProps {
  onClose: () => void;
  onSubmit: (input: ComplaintInput) => Promise<unknown>;
  /** 고칠 때 채워 둘 값. 새로 넣을 때는 없다. */
  initial?: ComplaintInput;
  isSubmitting: boolean;
}

const ComplaintFormModal = memo(function ComplaintFormModalComponent({
  onClose,
  onSubmit,
  initial,
  isSubmitting,
}: ComplaintFormModalProps) {
  return (
    /*
      배경을 눌러도 닫히지 않는다. 여덟 칸을 다 적어 놓고 옆을 잘못 스치면
      적은 것이 통째로 사라진다 — 닫는 길은 X와 취소 둘로 충분하다.
    */
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>{initial ? '민원 수정' : '민원 등록'}</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            <MdClose />
          </button>
        </div>

        <ComplaintForm
          onSubmit={onSubmit}
          onCancel={onClose}
          initial={initial}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
});

export default ComplaintFormModal;
