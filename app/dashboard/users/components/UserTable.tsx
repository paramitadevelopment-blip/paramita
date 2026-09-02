'use client';

import React, { memo, useCallback, useState, useEffect, useMemo } from 'react';
import { MdEdit, MdDelete, MdInfoOutline, MdArrowDropUp, MdArrowDropDown, MdHistory } from 'react-icons/md';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import { UserRow } from '../types';
import DepartmentLogsModal from './DepartmentLogsModal';
import { belongsToOrganization, isProtectedAccount } from '@/lib/roles';
import styles from './UserTable.module.css';

/** 역할값 → 화면에 보일 이름과 배지 색 클래스 */
const ROLE_LABEL: Record<string, string> = {
  admin: '관리자',
  subadmin: '서브관리자',
  user: '지사',
  staff: 'DB담당자',
};
const ROLE_BADGE_CLASS: Record<string, string> = {
  admin: 'admin',
  subadmin: 'subadmin',
  user: 'user',
  staff: 'staff',
};

interface UserTableProps {
  users: UserRow[];
  isLoading: boolean;
  onEdit: (user: UserRow) => void;
  onDelete: (userId: number, username: string) => void;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onSelectionChange?: (selectedIds: Set<number>) => void;
}

const UserTable = memo(function UserTable({ users, isLoading, onEdit, onDelete, sortBy, sortOrder, onSort, onSelectionChange }: UserTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [logsTarget, setLogsTarget] = useState<UserRow | null>(null);

  const handleEdit = useCallback(
    (user: UserRow) => {
      onEdit(user);
    },
    [onEdit]
  );

  const handleDelete = useCallback(
    (userId: number, username: string) => {
      onDelete(userId, username);
    },
    [onDelete]
  );

  useEffect(() => {
    onSelectionChange?.(selectedIds);
  }, [selectedIds]);

  const handleSelectAll = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newSet: Set<number> = e.target.checked
        ? new Set(users.filter((u) => !isProtectedAccount(u.role)).map((u) => u.id))
        : new Set();
      setSelectedIds(newSet);
    },
    [users]
  );

  const handleSelectUser = useCallback((userId: number) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  }, []);

  const sortedUsers = useMemo(() => {
    const adminUser = users.find(u => u.username === 'admin');
    const otherUsers = users.filter(u => u.username !== 'admin');

    const sortedOtherUsers = (sortBy === 'name' || sortBy === 'username')
      ? [...otherUsers].sort((a, b) => {
          const field = sortBy === 'name' ? 'name' : 'username';
          const aNum = parseInt(String(a[field as keyof UserRow]).replace(/\D/g, '')) || 0;
          const bNum = parseInt(String(b[field as keyof UserRow]).replace(/\D/g, '')) || 0;

          if (sortOrder === 'asc') {
            return aNum - bNum;
          } else {
            return bNum - aNum;
          }
        })
      : otherUsers;

    // 관리자 다음은 서브관리자 묶음, 그다음이 나머지다. filter는 순서를 그대로
    // 두므로 위에서 이미 적용한 정렬 결과가 각 묶음 안에서도 유지된다.
    const subadmins = sortedOtherUsers.filter((u) => u.role === 'subadmin');
    const rest = sortedOtherUsers.filter((u) => u.role !== 'subadmin');

    return adminUser ? [adminUser, ...subadmins, ...rest] : [...subadmins, ...rest];
  }, [users, sortBy, sortOrder]);

  if (isLoading) {
    return <div className={styles.loading}>로딩 중...</div>;
  }

  if (users.length === 0) {
    return <EmptyState message="사용자를 찾을 수 없습니다." />;
  }

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.checkboxTh}>
              <input
                type="checkbox"
                checked={
                  selectedIds.size > 0 &&
                  users
                    .filter(u => !isProtectedAccount(u.role))
                    .every(u => selectedIds.has(u.id))
                }
                onChange={handleSelectAll}
                className={styles.checkbox}
              />
            </th>
            <th className={styles.sortableHeader} onClick={() => onSort('username')}>
              <div className={styles.headerContent}>
                <span>아이디</span>
                {sortBy === 'username' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortableHeader} onClick={() => onSort('name')}>
              <div className={styles.headerContent}>
                <span>이름</span>
                {sortBy === 'name' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortableHeader} onClick={() => onSort('department')}>
              <div className={styles.headerContent}>
                <span>소속</span>
                {sortBy === 'department' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortableHeader} onClick={() => onSort('role')}>
              <div className={styles.headerContent}>
                <span>역할</span>
                {sortBy === 'role' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortableHeader} onClick={() => onSort('employee_id')}>
              <div className={styles.headerContent}>
                <span>사번</span>
                {sortBy === 'employee_id' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortableHeader} onClick={() => onSort('created_at')}>
              <div className={styles.headerContent}>
                <span>가입일</span>
                {sortBy === 'created_at' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {sortedUsers.map((user) => (
            <tr key={user.id}>
              <td className={styles.checkboxTd}>
                {!isProtectedAccount(user.role) && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(user.id)}
                    onChange={() => handleSelectUser(user.id)}
                    className={styles.checkbox}
                  />
                )}
              </td>
              <td>{user.username}</td>
              <td>{user.name || '-'}</td>
              <td>{user.department || '-'}</td>
              <td>
                <span className={`${styles.badge} ${styles[ROLE_BADGE_CLASS[user.role] ?? 'user']}`}>
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </td>
              <td>{user.employee_id || '-'}</td>
              <td>{new Date(user.created_at).toLocaleDateString('ko-KR').slice(0, -1)}</td>
              <td className={styles.actions}>
                <button
                  className={`${styles.iconBtn} ${styles.history}`}
                  onClick={() => setLogsTarget(user)}
                  title="소속 변경 이력"
                  style={{
                    visibility:
                      // 소속로그는 실제 조직에 속한 계정(지사)만 의미가 있다.
                      // 그 외는 소속이 역할로 고정돼 바뀔 일이 없다.
                      belongsToOrganization(user.role) ? 'visible' : 'hidden',
                  }}
                  disabled={
                    !belongsToOrganization(user.role)
                  }
                >
                  <MdHistory />
                  <span>소속로그</span>
                </button>
                <button
                  className={styles.iconBtn}
                  onClick={() => handleEdit(user)}
                  title="수정"
                >
                  <MdEdit />
                  <span>수정</span>
                </button>
                <button
                  className={`${styles.iconBtn} ${styles.delete}`}
                  onClick={() => handleDelete(user.id, user.username)}
                  title="삭제"
                  style={{ visibility: isProtectedAccount(user.role) ? 'hidden' : 'visible' }}
                  disabled={isProtectedAccount(user.role)}
                >
                  <MdDelete />
                  <span>삭제</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <DepartmentLogsModal
        isOpen={!!logsTarget}
        userId={logsTarget?.id ?? null}
        userName={logsTarget?.name || logsTarget?.username || ''}
        onClose={() => setLogsTarget(null)}
      />
    </div>
  );
});

export default UserTable;
