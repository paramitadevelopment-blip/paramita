'use client';

import React, { useCallback, memo } from 'react';
import { useCreateDepartment, useDeleteDepartment, useDepartments } from '@/app/hooks/useDepartments';
import { useAlert } from '@/app/components/Alert/Alert';
import DepartmentModal from '../components/DepartmentModal';

interface DepartmentsSectionProps {
  isOpen: boolean;
  onClose: () => void;
}

const DepartmentsSection = memo(function DepartmentsSectionComponent({ isOpen, onClose }: DepartmentsSectionProps) {
  const { data: departmentsData } = useDepartments();
  const createDepartmentMutation = useCreateDepartment();
  const deleteDepartmentMutation = useDeleteDepartment();
  const { showAlert } = useAlert();

  const handleDepartmentSubmit = useCallback(
    async (name: string) => {
      if (!name?.trim()) {
        showAlert({ type: 'error', title: '입력 오류', message: '소속명을 입력해주세요.' });
        return;
      }

      try {
        await createDepartmentMutation.mutateAsync(name);
        showAlert({ type: 'success', title: '완료', message: '소속이 추가되었습니다.' });
      } catch (error: any) {
        showAlert({ type: 'error', title: '오류', message: error.message || '소속 추가 중 오류가 발생했습니다.' });
      }
    },
    [createDepartmentMutation, showAlert]
  );

  const handleDepartmentDelete = useCallback(
    async (id: number) => {
      try {
        await deleteDepartmentMutation.mutateAsync({ id });
        showAlert({ type: 'success', title: '완료', message: '소속이 삭제되었습니다.' });
      } catch (error: any) {
        showAlert({ type: 'error', title: '오류', message: error.message || '소속 삭제 중 오류가 발생했습니다.' });
      }
    },
    [deleteDepartmentMutation, showAlert]
  );

  return (
    <DepartmentModal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handleDepartmentSubmit}
      isLoading={createDepartmentMutation.isPending}
      departments={departmentsData}
      onDelete={handleDepartmentDelete}
      isDeleting={deleteDepartmentMutation.isPending}
    />
  );
});

export default DepartmentsSection;
