'use client';

import React, { memo, useState } from 'react';
import { MdCheck, MdClose } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import { validateDepartmentContact } from '@/lib/departments';
import { formatPhone } from '@/lib/phoneFormat';
import styles from './DepartmentModal.module.css';

/**
 * 이미 있는 소속의 연락처를 그 줄에서 고친다.
 *
 * 창을 하나 더 띄우지 않는다 — 고칠 것이 두 칸뿐이라, 창이 열리고 닫히는
 * 동안 어느 소속을 고치던 중인지 놓친다. 이름 아래 그 자리에서 열고 닫는다.
 */
interface DepartmentContactEditorProps {
  phone: string;
  email: string;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (contact: { phone: string; email: string }) => Promise<void>;
}

const DepartmentContactEditor = memo(function DepartmentContactEditorComponent({
  phone: initialPhone,
  email: initialEmail,
  isSaving,
  onCancel,
  onSave,
}: DepartmentContactEditorProps) {
  const { showAlert } = useAlert();
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);

  const save = async () => {
    // 서버와 같은 규칙. 여기서 걸리면 요청을 안 보낸다.
    const error = validateDepartmentContact({ phone, email });
    if (error) {
      showAlert({ type: 'warning', title: '입력 확인', message: error });
      return;
    }
    try {
      await onSave({ phone: phone.trim(), email: email.trim() });
    } catch {
      // 실패 사유는 부모가 알렸다. 적은 값은 남겨 둔다 — 지우면 다시 쳐야 한다.
    }
  };

  return (
    <div className={styles.contactEditor}>
      <input
        type="text"
        inputMode="numeric"
        value={phone}
        onChange={(e) => setPhone(formatPhone(e.target.value))}
        placeholder="연락처"
        className={styles.contactInput}
        maxLength={14}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일"
        className={styles.contactInput}
        maxLength={100}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button type="button" className={styles.contactSaveBtn} onClick={save} disabled={isSaving}>
        <MdCheck />
        <span>{isSaving ? '저장 중' : '저장'}</span>
      </button>
      <button type="button" className={styles.contactCancelBtn} onClick={onCancel} disabled={isSaving}>
        <MdClose />
      </button>
    </div>
  );
});

export default DepartmentContactEditor;
