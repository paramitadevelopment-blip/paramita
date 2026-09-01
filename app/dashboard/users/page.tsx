'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/app/store/authStore';
import { useDepartments } from '@/app/hooks/useDepartments';
import { MdAdd } from 'react-icons/md';
import UsersSection from './containers/UsersSection';
import DepartmentsSection from './containers/DepartmentsSection';
import styles from './page.module.css';

function UsersPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const { data: departmentsData } = useDepartments();

  const handleOpenUserModal = useCallback(() => {
    setIsUserModalOpen(true);
  }, []);

  const handleCloseUserModal = useCallback(() => {
    setIsUserModalOpen(false);
  }, []);

  const handleOpenDepartmentModal = useCallback(() => {
    setIsDepartmentModalOpen(true);
  }, []);

  const handleCloseDepartmentModal = useCallback(() => {
    setIsDepartmentModalOpen(false);
  }, []);

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>사용자 관리</h1>
          <div className={styles.headerButtons}>
            <button className={styles.addBtn} onClick={handleOpenUserModal} title="사용자 추가">
              <MdAdd />
              <span>사용자 추가</span>
            </button>
            <button className={styles.addBtn} onClick={handleOpenDepartmentModal} title="소속 관리">
              <MdAdd />
              <span>소속 관리</span>
            </button>
          </div>
        </div>

        <div className={styles.contentWrapper}>
          <UsersSection
            departments={departmentsData || []}
            onAddDepartment={handleOpenDepartmentModal}
            isUserModalOpen={isUserModalOpen}
            onOpenUserModal={handleOpenUserModal}
            onCloseUserModal={handleCloseUserModal}
          />

          <DepartmentsSection
            isOpen={isDepartmentModalOpen}
            onClose={handleCloseDepartmentModal}
          />
        </div>
      </div>
    </>
  );
}

export default UsersPage;
