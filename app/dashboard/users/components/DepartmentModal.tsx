'use client';

import React, { memo, useCallback, useState } from 'react';
import { MdClose, MdDelete, MdEdit } from 'react-icons/md';
import { useAlert } from '@/app/components/Alert/Alert';
import { useDeleteDepartment } from '@/app/hooks/useDepartments';
import { getUndeletableReason, isHiddenDepartment } from '@/lib/departments';
import DepartmentForm from './DepartmentForm';
import DepartmentContactEditor from './DepartmentContactEditor';
import type { DepartmentInput } from '@/app/hooks/useDepartments';
import Pagination from '@/app/components/Pagination/Pagination';
import styles from './DepartmentModal.module.css';

interface Department {
  id: number;
  name: string;
  /**
   * 사람이 속하는 조직. 대부분 name과 같고, 파라인슈만 1:N이다
   * ('파라인슈1'·'파라인슈2' → '파라인슈'). 지울 수 있는지 판단하는 데 쓴다.
   */
  group_name: string;
  /** 업로드한 원본이 들어가는 자리. 목록에서 뺀다. */
  is_admin?: boolean;
  phone?: string | null;
  email?: string | null;
  created_at: string;
}

interface DepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: DepartmentInput) => Promise<void>;
  isLoading: boolean;
  departments?: Department[];
  onDelete?: (id: number) => Promise<void>;
  isDeleting?: boolean;
  /** 이미 있는 소속의 연락처를 고친다. 실패하면 던진다 — 편집 상태를 유지하려고. */
  onSaveContact?: (id: number, contact: { phone: string; email: string }) => Promise<void>;
  isSavingContact?: boolean;
}

const DepartmentModal = memo(function DepartmentModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  departments,
  onDelete,
  isDeleting,
  onSaveContact,
  isSavingContact,
}: DepartmentModalProps) {
  const [page, setPage] = useState(1);
  // 연락처를 고치는 중인 소속. 한 번에 하나만 연다 — 둘을 열어 두면 어느 걸 저장했는지 헷갈린다.
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const itemsPerPage = 5;
  const [deptToDelete, setDeptToDelete] = useState<{ id: number; name: string } | null>(null);
  const [pendingUserCount, setPendingUserCount] = useState(0);
  const [pendingFileCount, setPendingFileCount] = useState(0);
  const { showAlert } = useAlert();
  const deleteDepMutation = useDeleteDepartment();

  const handleDelete = useCallback(
    async (id: number, name: string) => {
      try {
        // 사용자 수 확인
        const result = await deleteDepMutation.mutateAsync({
          id,
          checkOnly: true,
        });

        // 사용자나 파일이 남아 있으면 옮길 소속을 먼저 고르게 한다.
        // 파일도 소속을 참조하므로 옮기지 않으면 삭제할 수 없다.
        const userCount = result.userCount || 0;
        const fileCount = result.fileCount || 0;

        if (userCount > 0 || fileCount > 0) {
          setDeptToDelete({ id, name });
          setPendingUserCount(userCount);
          setPendingFileCount(fileCount);
          return;
        }

        // 사용자가 없으면 바로 삭제
        showAlert({
          type: 'error',
          title: '소속 삭제',
          message: (
            <>
              <span style={{ color: '#db1a62', fontWeight: 600 }}>"{name}"</span> 소속을 정말 삭제하시겠습니까?
            </>
          ),
          showCancelButton: true,
          onConfirm: async () => {
            try {
              await deleteDepMutation.mutateAsync({ id });
              showAlert({ type: 'success', title: '완료', message: '소속이 삭제되었습니다.' });
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
          message: '사용자 확인 중 오류가 발생했습니다.',
        });
      }
    },
    [deleteDepMutation, showAlert, onDelete]
  );

  const filteredDepartments =
    departments?.filter((dept) => !dept.is_admin && !isHiddenDepartment(dept.name)) || [];
  const totalPages = filteredDepartments ? Math.ceil(filteredDepartments.length / itemsPerPage) : 1;
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentDepartments = filteredDepartments?.slice(startIndex, endIndex) || [];

  const handleConfirmDelete = useCallback(
    (newDepartmentName: string) => {
      if (!deptToDelete) return;

      showAlert({
        type: 'error',
        title: '소속 삭제',
        message: (
          <>
            <span style={{ color: '#db1a62', fontWeight: 600 }}>"{deptToDelete.name}"</span> 소속의{' '}
            {pendingUserCount > 0 && (
              <span style={{ color: '#db1a62', fontWeight: 600 }}>사용자 {pendingUserCount}명</span>
            )}
            {pendingUserCount > 0 && pendingFileCount > 0 && ', '}
            {pendingFileCount > 0 && (
              <span style={{ color: '#db1a62', fontWeight: 600 }}>파일 {pendingFileCount}건</span>
            )}
            이
            <br />
            <span style={{ color: '#db1a62', fontWeight: 600 }}>"{newDepartmentName}"</span>로 변경됩니다.
            <br />
            정말 진행하시겠습니까?
          </>
        ),
        showCancelButton: true,
        onConfirm: async () => {
          try {
            await deleteDepMutation.mutateAsync({
              id: deptToDelete.id,
              newDepartmentName,
            });
            showAlert({ type: 'success', title: '완료', message: '소속이 삭제되었습니다.' });
            setDeptToDelete(null);
            setPendingUserCount(0);
            setPendingFileCount(0);
          } catch (error) {
            showAlert({
              type: 'error',
              title: '오류',
              message: '삭제 중 오류가 발생했습니다.',
            });
          }
        },
      });
    },
    [deptToDelete, showAlert, pendingUserCount, pendingFileCount, deleteDepMutation, onDelete]
  );

  if (!isOpen) return null;

  const otherDepartments = filteredDepartments.filter(d => d.name !== deptToDelete?.name);

  return (
    <>
      {deptToDelete && (
        <div className={styles.overlay} style={{ zIndex: 1001 }}>
          <div className={styles.modal}>
            <div className={styles.header}>
              <h2>소속 변경</h2>
              <button
                className={styles.closeBtn}
                onClick={() => {
                  setDeptToDelete(null);
                  setPendingUserCount(0);
                }}
              >
                <MdClose />
              </button>
            </div>
            <div className={styles.content}>
              <p className={styles.changeMessage}>
                <span className={styles.highlight}>"{deptToDelete.name}"</span> 소속을 사용하는 <span className={styles.highlight}>{pendingUserCount}명</span>의 사용자를 다른 소속으로 변경해주세요.
              </p>
              <div className={styles.departmentList}>
                {otherDepartments.map(dept => (
                  <button
                    key={dept.id}
                    className={styles.departmentSelectBtn}
                    onClick={() => handleConfirmDelete(dept.name)}
                  >
                    {dept.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>소속 관리</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <MdClose />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3>기존 소속</h3>
              {filteredDepartments && filteredDepartments.length > 0 && (
                <span className={styles.count}>총 <span className={styles.countNumber}>{filteredDepartments.length}</span>개</span>
              )}
            </div>
            <div className={styles.departmentList}>
              {filteredDepartments && filteredDepartments.length > 0 ? (
                currentDepartments.map((dept) => {
                  // 쪼개진 조직의 하위 분류는 혼자 지울 수 없다. 왜 못 지우는지
                  // 툴팁으로 알려준다 — 회색 버튼만 보여주면 고장으로 읽힌다.
                  const undeletable = getUndeletableReason(departments, dept.name);

                  const editing = editingContactId === dept.id;

                  return (
                    <div key={dept.id} className={styles.departmentItem}>
                      <div className={styles.departmentMain}>
                        <span className={styles.departmentName}>{dept.name}</span>
                        {/*
                          연락처는 이름 아래 작게. 없으면 '연락처 없음'으로 알린다 —
                          비워 두면 "안 적은 것"과 "못 불러온 것"이 구별되지 않는다.
                        */}
                        {editing ? (
                          <DepartmentContactEditor
                            phone={dept.phone ?? ''}
                            email={dept.email ?? ''}
                            isSaving={!!isSavingContact}
                            onCancel={() => setEditingContactId(null)}
                            onSave={async (contact) => {
                              await onSaveContact?.(dept.id, contact);
                              setEditingContactId(null);
                            }}
                          />
                        ) : (
                          <span className={styles.departmentContact}>
                            {dept.phone || dept.email
                              ? [dept.phone, dept.email].filter(Boolean).join(' · ')
                              : '연락처 없음'}
                          </span>
                        )}
                      </div>
                      <div className={styles.departmentActions}>
                        {!editing && onSaveContact && (
                          <button
                            className={styles.editBtn}
                            onClick={() => setEditingContactId(dept.id)}
                            title="연락처 수정"
                          >
                            <MdEdit />
                            <span>연락처</span>
                          </button>
                        )}
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(dept.id, dept.name)}
                          disabled={isDeleting || !!undeletable}
                          title={undeletable ?? '삭제'}
                        >
                          <MdDelete />
                          <span>삭제</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className={styles.emptyText}>소속이 없습니다.</p>
              )}
            </div>

            {filteredDepartments && filteredDepartments.length > 0 && (
              <div className={styles.paginationWrapper}>
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  isLoading={false}
                  style={{ marginTop: '0' }}
                />
              </div>
            )}
          </div>

          <div className={styles.section}>
            <h3>새 소속 추가</h3>
            <DepartmentForm
              onSubmit={onSubmit}
              isLoading={isLoading}
              onCancel={onClose}
              departments={departments}
            />
          </div>
        </div>
      </div>
      </div>
    </>
  );
});

export default DepartmentModal;
