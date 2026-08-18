'use client';

import React, { memo, useCallback, useState, useEffect, useMemo } from 'react';
import { MdEdit, MdDelete, MdInfoOutline, MdArrowDropUp, MdArrowDropDown, MdHistory } from 'react-icons/md';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import { UserRow } from '../types';
import DepartmentLogsModal from './DepartmentLogsModal';
import styles from './UserTable.module.css';

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
        ? new Set(users.filter((u) => u.role !== 'admin').map((u) => u.id))
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

    return adminUser ? [adminUser, ...sortedOtherUsers] : sortedOtherUsers;
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
                    .filter(u => u.role !== 'admin')
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
            <th>
              <div className={styles.headerContent}>
                <span>사번</span>
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
                {user.role !== 'admin' && (
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
              <td>{user.employee_id || '-'}</td>
              <td>{new Date(user.created_at).toLocaleDateString('ko-KR').slice(0, -1)}</td>
              <td className={styles.actions}>
                <button
                  className={`${styles.iconBtn} ${styles.history}`}
                  onClick={() => setLogsTarget(user)}
                  title="소속 변경 이력"
                  style={{ visibility: user.role === 'admin' ? 'hidden' : 'visible' }}
                  disabled={user.role === 'admin'}
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
                  style={{ visibility: user.role === 'admin' ? 'hidden' : 'visible' }}
                  disabled={user.role === 'admin'}
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
