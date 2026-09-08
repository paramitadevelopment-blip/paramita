'use client';

import React, { useState, useCallback, memo, useEffect } from 'react';
import { useAlert } from '@/app/components/Alert/Alert';
import { validateDepartmentContact } from '@/lib/departments';
import { formatPhone } from '@/lib/phoneFormat';
import type { DepartmentInput } from '@/app/hooks/useDepartments';
import styles from './DepartmentForm.module.css';

interface Department {
  id: number;
  name: string;
}

interface DepartmentFormProps {
  onSubmit: (input: DepartmentInput) => Promise<void>;
  isLoading: boolean;
  onCancel: () => void;
  departments?: Department[];
}

/**
 * 새 소속.
 *
 * 이름은 필수, 연락처·이메일은 비워도 된다 — 소속을 만드는 순간 그 지사의
 * 연락처를 모르는 일이 흔하고, 필수로 걸면 없는 값을 지어내게 된다.
 * 적었다면 모양은 서버와 같은 규칙으로 본다(validateDepartmentContact).
 */
const DepartmentForm = memo(function DepartmentForm({
  onSubmit,
  isLoading,
  onCancel,
  departments = [],
}: DepartmentFormProps) {
  const { showAlert } = useAlert();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; contact?: string }>({});

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  // 치는 대로 하이픈을 넣어 준다. 자릿수가 눈에 보여야 한 자리 빠뜨린 걸 안다.
  const handlePhone = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  }, []);

  // 300ms 후에 유효성 검사 (Debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      const result: { name?: string; contact?: string } = {};
      const trimmed = name.trim();

      if (trimmed.length < 2 || trimmed.length > 10) {
        result.name = '소속명은 2~10자여야 합니다.';
      }

      // 한글, 영문, 숫자, 공백, 하이픈만 허용
      if (trimmed && !/^[가-힣a-zA-Z0-9 -]+$/.test(trimmed)) {
        result.name = '소속명은 한글, 영문, 숫자, 공백, 하이픈만 사용 가능합니다.';
      }

      // 중복 체크
      if (trimmed && departments.some((dept) => dept.name.toLowerCase() === trimmed.toLowerCase())) {
        result.name = '이미 존재하는 소속입니다.';
      }

      const contact = validateDepartmentContact({ phone, email });
      if (contact) result.contact = contact;

      setErrors(result);
    }, 300);

    return () => clearTimeout(timer);
  }, [name, phone, email, departments]);

  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!name.trim()) {
        showAlert({ type: 'error', title: '입력 오류', message: '소속명을 입력해주세요.' });
        return;
      }

      if (!isValid) {
        showAlert({
          type: 'error',
          title: '입력 오류',
          message: errors.name || errors.contact || '입력 형식이 올바르지 않습니다.',
        });
        return;
      }

      await onSubmit({ name, phone: phone.trim(), email: email.trim() });
      setName('');
      setPhone('');
      setEmail('');
    },
    [name, phone, email, onSubmit, isValid, errors, showAlert]
  );

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formGroup}>
        <input
          type="text"
          id="name"
          value={name}
          onChange={handleChange}
          placeholder="예: 파라미타"
          className={styles.input}
          maxLength={10}
        />
        {name && (
          <div className={styles.feedback}>
            {errors.name ? (
              <span className={styles.feedbackBad}>{errors.name}</span>
            ) : (
              <span className={styles.feedbackOk}>✓ 사용 가능한 소속명입니다.</span>
            )}
          </div>
        )}
      </div>

      {/* 연락처·이메일. 나란히 두되 좁은 창에서는 세로로 선다. */}
      <div className={styles.contactRow}>
        <div className={styles.formGroup}>
          <input
            type="text"
            inputMode="numeric"
            value={phone}
            onChange={handlePhone}
            placeholder="연락처 (선택) 010-0000-0000"
            className={styles.input}
            maxLength={14}
          />
        </div>
        <div className={styles.formGroup}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일 (선택)"
            className={styles.input}
            maxLength={100}
          />
        </div>
      </div>
      {errors.contact && (phone || email) && (
        <div className={styles.feedback}>
          <span className={styles.feedbackBad}>{errors.contact}</span>
        </div>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn} disabled={isLoading || !isValid || !name.trim()}>
          {isLoading ? '추가 중...' : '추가'}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={isLoading}>
          취소
        </button>
      </div>
    </form>
  );
});

export default DepartmentForm;
