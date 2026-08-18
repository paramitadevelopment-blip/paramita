'use client';

import React, { memo } from 'react';
import { MdClose } from 'react-icons/md';
import { UserForm as UserFormType } from '../types';
import UserForm from './UserForm';
import styles from './UserModal.module.css';

interface UserModalProps {
  isOpen: boolean;
  initialData?: UserFormType;
  onClose: () => void;
  onSubmit: (data: UserFormType) => Promise<void>;
  isLoading: boolean;
}

const UserModal = memo(function UserModal({
  isOpen,
  initialData,
  onClose,
  onSubmit,
  isLoading,
}: UserModalProps) {
  if (!isOpen) return null;

  const isEditMode = !!initialData?.id;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{isEditMode ? '사용자 수정' : '사용자 추가'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <div className={styles.content}>
          <UserForm
            initialData={initialData}
            onSubmit={onSubmit}
            isLoading={isLoading}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  );
});

export default UserModal;
