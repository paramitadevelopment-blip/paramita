'use client';

import React, { useState, useCallback } from 'react';
import { MdLock } from 'react-icons/md';
import { useVerifyHistoryPassword } from '@/app/hooks/useHistoryAccess';
import styles from './PasswordGate.module.css';

const PasswordGate = React.memo(function PasswordGateComponent() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { mutate: verify, isPending } = useVerifyHistoryPassword();

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!password.trim()) {
        setError('비밀번호를 입력해주세요.');
        return;
      }

      verify(password, {
        onError: (err: Error) => {
          setError(err.message);
          setPassword('');
        },
      });
    },
    [password, verify]
  );

  return (
    <div className={styles.gate}>
      <div className={styles.icon}>
        <MdLock />
      </div>

      <h2 className={styles.title}>비밀번호 입력</h2>
      <p className={styles.description}>
        파일 삭제 히스토리를 보려면 비밀번호가 필요합니다.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          type="password"
          className={styles.input}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError('');
          }}
          placeholder="비밀번호"
          autoFocus
          disabled={isPending}
        />

        {error && <div className={styles.error}>{error}</div>}

        <button type="submit" className={styles.submitBtn} disabled={isPending}>
          {isPending ? '확인 중...' : '확인'}
        </button>
      </form>
    </div>
  );
});

export default PasswordGate;
