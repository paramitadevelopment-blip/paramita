'use client';

import React, { useState, useCallback, useEffect, memo, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getCsrfToken } from '@/app/store/authStore';
import { useAllUsers } from '@/app/hooks/useFileUpload';
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useDeleteUsers } from '@/app/hooks/useUsers';
import { useAlert } from '@/app/components/Alert/Alert';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import UserTable from '../components/UserTable';
import UserModal from '../components/UserModal';
import Pagination from '@/app/components/Pagination/Pagination';
import { UserForm, UserRow } from '../types';
import styles from '../page.module.css';
import { MdAdd } from 'react-icons/md';

interface UsersSectionProps {
  departments: any[];
  onAddDepartment: () => void;
  isUserModalOpen?: boolean;
  onOpenUserModal?: () => void;
  onCloseUserModal?: () => void;
}

const UsersSection = memo(function UsersSectionComponent({
  departments,
  onAddDepartment,
  isUserModalOpen: externalIsUserModalOpen,
  onOpenUserModal: externalOnOpenUserModal,
  onCloseUserModal: externalOnCloseUserModal,
}: UsersSectionProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [internalIsModalOpen, setInternalIsModalOpen] = useState(false);
  const isModalOpen = externalIsUserModalOpen ?? internalIsModalOpen;

  const handleOpenModal = () => {
    externalOnOpenUserModal?.() ?? setInternalIsModalOpen(true);
  };

  const handleCloseModal = () => {
    externalOnCloseUserModal?.() ?? setInternalIsModalOpen(false);
  };
  const [selectedUser, setSelectedUser] = useState<UserForm | undefined>();
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [verificationInput, setVerificationInput] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  const { data, isLoading: isUsersLoading } = useUsers(page, search, selectedDepartment, sortBy, sortOrder, limit);
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();
  const deleteUsersMutation = useDeleteUsers();
  const { showAlert } = useAlert();

  useEffect(() => {
    setSelectedUserIds(new Set());
  }, [page, search, selectedDepartment, sortBy, sortOrder]);

  const handleAddClick = useCallback(() => {
    setSelectedUser(undefined);
    handleOpenModal();
  }, [handleOpenModal]);

  const handleEditClick = useCallback((user: UserRow) => {
    setSelectedUser(user);
    handleOpenModal();
  }, [handleOpenModal]);

  const handleDeleteClick = useCallback((userId: number, username: string) => {
    const user = data?.data.find(u => u.id === userId);
    if (user?.role === 'admin') {
      showAlert({ type: 'error', title: '오류', message: '관리자는 삭제할 수 없습니다.' });
      return;
    }

    showAlert({
      type: 'error',
      title: '사용자 삭제',
      message: '정말 삭제하시겠습니까?',
      showCancelButton: true,
      onConfirm: () => {
        deleteMutation.mutate(userId, {
          onSuccess: () => {
            showAlert({ type: 'success', title: '완료', message: '사용자가 삭제되었습니다.' });
          },
          onError: () => {
            showAlert({ type: 'error', title: '오류', message: '삭제 중 오류가 발생했습니다.' });
          },
        });
      },
    });
  }, [data, deleteMutation, showAlert]);

  const handleModalSubmit = useCallback(
    async (formData: UserForm) => {
      if (!formData.username?.trim()) {
        showAlert({ type: 'error', title: '입력 오류', message: '아이디를 입력해주세요.' });
        return;
      }

      if (!formData.name?.trim()) {
        showAlert({ type: 'error', title: '입력 오류', message: '이름을 입력해주세요.' });
        return;
      }

      if (!formData.password?.trim() && !selectedUser?.id) {
        showAlert({ type: 'error', title: '입력 오류', message: '비밀번호를 입력해주세요.' });
        return;
      }

      if (!formData.department?.trim()) {
        showAlert({ type: 'error', title: '입력 오류', message: '소속을 선택해주세요.' });
        return;
      }

      if (selectedUser?.id) {
        if (!formData.name?.trim()) {
          showAlert({ type: 'error', title: '입력 오류', message: '이름을 입력해주세요.' });
          return;
        }

        if (!formData.department?.trim()) {
          showAlert({ type: 'error', title: '입력 오류', message: '소속을 선택해주세요.' });
          return;
        }

        const hasChanges =
          formData.name !== selectedUser.name ||
          formData.department !== selectedUser.department ||
          formData.employee_id !== selectedUser.employee_id ||
          formData.password?.trim();

        if (!hasChanges) {
          showAlert({ type: 'warning', title: '알림', message: '변경사항이 없습니다.' });
          return;
        }
      }

      try {
        if (selectedUser?.id) {
          const { username, ...updateData } = formData;
          await updateMutation.mutateAsync({ id: selectedUser.id, ...updateData });
          showAlert({ type: 'success', title: '완료', message: '사용자가 수정되었습니다.' });
        } else {
          if (!formData.password) {
            throw new Error('비밀번호는 필수입니다.');
          }
          await createMutation.mutateAsync({
            username: formData.username,
            password: formData.password,
            name: formData.name,
            department: formData.department,
            employee_id: formData.employee_id,
          });
          showAlert({ type: 'success', title: '완료', message: '사용자가 추가되었습니다.' });
        }
        handleCloseModal();
      } catch (error: any) {
        const errorMessage = error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.';
        showAlert({ type: 'error', title: '오류', message: errorMessage });
      }
    },
    [selectedUser, createMutation, updateMutation, showAlert, handleCloseModal]
  );

  const handleModalClose = useCallback(() => {
    handleCloseModal();
    setSelectedUser(undefined);
  }, [handleCloseModal]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
    setSelectedUserIds(new Set());
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    setSelectedUserIds(new Set());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSort = useCallback((column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
    setSelectedUserIds(new Set());
  }, [sortBy, sortOrder]);

  const handleBulkDelete = useCallback(() => {
    if (selectedUserIds.size === 0) {
      showAlert({ type: 'warning', title: '알림', message: '삭제할 사용자를 선택해주세요.' });
      return;
    }

    const adminSelected = Array.from(selectedUserIds).some((userId) => {
      const user = data?.data.find(u => u.id === userId);
      return user?.role === 'admin';
    });

    if (adminSelected) {
      showAlert({ type: 'error', title: '오류', message: '관리자는 삭제할 수 없습니다.' });
      return;
    }

    const count = selectedUserIds.size;
    showAlert({
      type: 'error',
      title: '사용자 삭제',
      message: (
        <>
          선택된 <span style={{ color: '#db1a62', fontWeight: 600 }}>{count}명</span>의 사용자를 정말 삭제하시겠습니까?
        </>
      ),
      showCancelButton: true,
      onConfirm: async () => {
        try {
          const usersToDelete = Array.from(selectedUserIds)
            .map((userId) => {
              const user = data?.data.find(u => u.id === userId);
              return user && user.username !== 'admin' ? userId : null;
            })
            .filter((id): id is number => id !== null);

          await deleteUsersMutation.mutateAsync(usersToDelete);

          setSelectedUserIds(new Set());
          showAlert({ type: 'success', title: '완료', message: `${count}명의 사용자가 삭제되었습니다.` });
        } catch (error) {
          showAlert({ type: 'error', title: '오류', message: '삭제 중 오류가 발생했습니다.' });
        }
      },
    });
  }, [selectedUserIds, data, deleteUsersMutation, showAlert]);

  const getAllUsersMutation = useAllUsers();

  const handleAllDelete = useCallback(async () => {
    try {
      const allUserIds = await getAllUsersMutation.mutateAsync();

      if (allUserIds.length === 0) {
        showAlert({ type: 'warning', title: '알림', message: '삭제할 사용자가 없습니다.' });
        return;
      }

      const code = Math.floor(1000 + Math.random() * 9000).toString();
      setVerificationCode(code);
      setVerificationInput('');

      showAlert({
        type: 'error',
        title: '사용자 삭제',
        message: (
          <>
            전체 <span style={{ color: '#db1a62', fontWeight: 600 }}>{allUserIds.length}명</span>의 사용자를 정말 삭제하시겠습니까?
          </>
        ),
        showCancelButton: true,
        verificationCode: code,
        verificationInput: verificationInput,
        onVerificationChange: setVerificationInput,
        onConfirm: async () => {
          try {
            await deleteUsersMutation.mutateAsync(allUserIds);

            setSelectedUserIds(new Set());
            setVerificationCode('');
            setVerificationInput('');

            showAlert({
              type: 'success',
              title: '완료',
              message: `${allUserIds.length}명의 사용자가 삭제되었습니다.`,
            });
          } catch (error) {
            showAlert({
              type: 'error',
              title: '오류',
              message: '삭제 중 오류가 발생했습니다.',
            });
          }
        },
      });
    } catch (error) {
      showAlert({
        type: 'error',
        title: '오류',
        message: '사용자 조회 중 오류가 발생했습니다.',
      });
    }
  }, [deleteUsersMutation, verificationInput, showAlert, getAllUsersMutation]);

  const isLoading = isUsersLoading || createMutation.isPending || updateMutation.isPending || deleteMutation.isPending || deleteUsersMutation.isPending;

  return (
    <>
      <Spinner isLoading={isLoading} />

      <div className={styles.searchSection}>
        <div className={styles.totalCount}>
          총 <span>{data?.pagination.total || 0}</span>명
        </div>
        <SearchBar value={search} onChange={handleSearchChange} onReset={() => {
          setSearch('');
          setPage(1);
        }} />
      </div>

      <div className={styles.controlsSection}>
        <select
          className={styles.select}
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setPage(1);
          }}
        >
          <option value="username">아이디순</option>
          <option value="name">이름순</option>
          <option value="department">소속순</option>
          <option value="created_at">가입일순</option>
        </select>

        <select
          className={styles.select}
          value={limit}
          onChange={(e) => {
            setLimit(parseInt(e.target.value));
            setPage(1);
          }}
        >
          <option value="10">10개씩보기</option>
          <option value="20">20개씩보기</option>
          <option value="30">30개씩보기</option>
          <option value="50">50개씩보기</option>
        </select>
      </div>

      <div className={styles.departmentsFilter}>
        <button
          className={`${styles.departmentBtn} ${selectedDepartment === '' ? styles.active : ''}`}
          onClick={() => {
            setSelectedDepartment('');
            setPage(1);
            setSelectedUserIds(new Set());
          }}
        >
          전체
        </button>
        {departments && Array.isArray(departments) ? (
          departments.filter((dept) => dept.name !== '관리자').map((dept) => (
            <button
              key={dept.id}
              className={`${styles.departmentBtn} ${selectedDepartment === dept.name ? styles.active : ''}`}
              onClick={() => {
                setSelectedDepartment(dept.name);
                setPage(1);
                setSelectedUserIds(new Set());
              }}
            >
              {dept.name}
            </button>
          ))
        ) : null}
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
        <button
          className={styles.bulkDeleteBtn}
          onClick={handleBulkDelete}
          disabled={isLoading || selectedUserIds.size === 0}
        >
          선택된 항목 삭제 ({selectedUserIds.size})
        </button>
        <button
          className={styles.allDeleteBtn}
          onClick={handleAllDelete}
          disabled={isLoading}
        >
          전체 삭제
        </button>
      </div>

      <UserTable
        key={`${page}-${selectedDepartment}-${search}`}
        users={useMemo(() => {
          const users = (data?.data || []) as UserRow[];
          const adminUser = users.find(u => u.username === 'admin');
          const otherUsers = users.filter(u => u.username !== 'admin');
          return adminUser ? [adminUser, ...otherUsers] : users;
        }, [data?.data])}
        isLoading={isLoading}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onSelectionChange={setSelectedUserIds}
      />

      <Pagination
        currentPage={page}
        totalPages={data?.pagination.pages || 1}
        onPageChange={handlePageChange}
        isLoading={isLoading}
      />

      <UserModal
        isOpen={isModalOpen}
        initialData={selectedUser}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />
    </>
  );
});

export default UsersSection;
