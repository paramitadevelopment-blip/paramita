'use client';

import React, { useMemo, memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import styles from '../page.module.css';

interface User {
  id: number;
  username: string;
  name: string;
  department: string;
  created_at: string;
}

interface RecentUsersSectionProps {
  users: User[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  onUserClick: (user: User) => void;
}

function RecentUsersSection({
  users,
  sortBy,
  sortOrder,
  onSort,
  onUserClick,
}: RecentUsersSectionProps) {
  const sortedUsers = useMemo(() => {
    if (!users) return [];
    const sorted = [...users];
    sorted.sort((a, b) => {
      let aVal: any = a[sortBy as keyof User];
      let bVal: any = b[sortBy as keyof User];

      if (sortBy === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [users, sortBy, sortOrder]);

  return (
    <div className={styles.activityCard}>
      <h3>최근 추가된 사용자 (최근 5명)</h3>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('username')}>
                <div className={styles.headerContent}>
                  <span>아이디</span>
                  {sortBy === 'username' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('name')}>
                <div className={styles.headerContent}>
                  <span>이름</span>
                  {sortBy === 'name' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('department')}>
                <div className={styles.headerContent}>
                  <span>소속</span>
                  {sortBy === 'department' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('created_at')}>
                <div className={styles.headerContent}>
                  <span>추가일시</span>
                  {sortBy === 'created_at' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr key={user.id} style={{ cursor: 'pointer' }} onClick={() => onUserClick(user)}>
                <td>{user.username}</td>
                <td>{user.name}</td>
                <td>{user.department || '-'}</td>
                <td>{new Date(user.created_at).toLocaleDateString('ko-KR').slice(0, -1)}</td>
              </tr>
            ))}
            {!users?.length && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: '#999' }}>
                  추가된 사용자가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(RecentUsersSection);
