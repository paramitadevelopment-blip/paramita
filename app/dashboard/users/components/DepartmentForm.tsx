'use client';

import React, { useState, useCallback, memo, useEffect } from 'react';
import { useAlert } from '@/app/components/Alert/Alert';
import styles from './DepartmentForm.module.css';

interface Department {
  id: number;
  name: string;
}

interface DepartmentFormProps {
  onSubmit: (name: string) => Promise<void>;
  isLoading: boolean;
  onCancel: () => void;
  departments?: Department[];
}

const DepartmentForm = memo(function DepartmentForm({
  onSubmit,
  isLoading,
  onCancel,
  departments = [],
}: DepartmentFormProps) {
  const { showAlert } = useAlert();
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<{ name?: string }>({});

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  // 300ms 후에 유효성 검사 (Debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      const result: { name?: string } = {};
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

      setErrors(result);
    }, 300);

    return () => clearTimeout(timer);
  }, [name, departments]);

  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!name.trim()) {
        showAlert({ type: 'error', title: '입력 오류', message: '소속명을 입력해주세요.' });
        return;
      }

      if (!isValid) {
        showAlert({ type: 'error', title: '입력 오류', message: errors.name || '입력 형식이 올바르지 않습니다.' });
        return;
      }

      await onSubmit(name);
      setName('');
    },
    [name, onSubmit, isValid, errors, showAlert]
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
          <div style={{ marginTop: '8px', fontSize: '16px' }}>
            {errors.name ? (
              <span style={{ color: '#db1a62' }}>{errors.name}</span>
            ) : (
              <span style={{ color: '#4a90e2' }}>✓ 사용 가능한 소속명입니다.</span>
            )}
          </div>
        )}
      </div>

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
