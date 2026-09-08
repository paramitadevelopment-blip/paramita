'use client';

import React, { useCallback, memo } from 'react';
import {
  useCreateDepartment,
  useDeleteDepartment,
  useDepartments,
  useUpdateDepartmentContact,
  type DepartmentInput,
} from '@/app/hooks/useDepartments';
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
  const updateContactMutation = useUpdateDepartmentContact();
  const { showAlert } = useAlert();

  const handleDepartmentSubmit = useCallback(
    async (input: DepartmentInput) => {
      if (!input.name?.trim()) {
        showAlert({ type: 'error', title: '입력 오류', message: '소속명을 입력해주세요.' });
        return;
      }

      try {
        await createDepartmentMutation.mutateAsync(input);
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

  // 이미 있는 소속의 연락처를 채우거나 고친다. 실패 사유는 서버가 말해 준다.
  const handleContactSave = useCallback(
    async (id: number, contact: { phone: string; email: string }) => {
      try {
        await updateContactMutation.mutateAsync({ id, ...contact });
        showAlert({ type: 'success', title: '완료', message: '연락처를 저장했습니다.' });
      } catch (error: any) {
        showAlert({ type: 'error', title: '오류', message: error.message || '연락처를 저장하지 못했습니다.' });
        throw error;
      }
    },
    [updateContactMutation, showAlert]
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
      onSaveContact={handleContactSave}
      isSavingContact={updateContactMutation.isPending}
    />
  );
});

export default DepartmentsSection;
