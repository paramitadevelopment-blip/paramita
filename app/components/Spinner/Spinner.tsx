'use client';

import React, { memo } from 'react';
import styles from './Spinner.module.css';

interface SpinnerProps {
  isLoading?: boolean;
}

const Spinner = memo(function Spinner({ isLoading = true }: SpinnerProps) {
  if (!isLoading) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.spinner}>
        <div className={styles.ring}></div>
        <p className={styles.text}>로딩중</p>
      </div>
    </div>
  );
});

export default Spinner;
