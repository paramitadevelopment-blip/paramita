'use client';

import React, { memo } from 'react';
import { MdInfoOutline } from 'react-icons/md';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  message: string;
  icon?: React.ReactNode;
}

const EmptyState = memo(function EmptyState({ message, icon }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon || <MdInfoOutline className={styles.emptyIcon} />}
      <p>{message}</p>
    </div>
  );
});

export default EmptyState;
