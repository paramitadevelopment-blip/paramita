'use client';

import React, { useMemo, memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import styles from '../page.module.css';

interface DepartmentStat {
  id: number;
  name: string;
  userCount: number;
  fileCount: number;
}

interface DepartmentStatsSectionProps {
  stats: DepartmentStat[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}

function DepartmentStatsSection({
  stats,
  sortBy,
  sortOrder,
  onSort,
}: DepartmentStatsSectionProps) {
  const sortedDepts = useMemo(() => {
    if (!stats) return [];
    const sorted = [...stats].filter((dept) => dept.name !== '관리자');
    sorted.sort((a, b) => {
      let aVal: any = a[sortBy as keyof DepartmentStat];
      let bVal: any = b[sortBy as keyof DepartmentStat];

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [stats, sortBy, sortOrder]);

  return (
    <div>
      <h3 className={styles.statisticsTitle} style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '2px solid #e0e0e0' }}>소속별 통계</h3>
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('name')}>
                <div className={styles.headerContent}>
                  <span>소속명</span>
                  {sortBy === 'name' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('userCount')}>
                <div className={styles.headerContent}>
                  <span>사용자 수</span>
                  {sortBy === 'userCount' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => onSort('fileCount')}>
                <div className={styles.headerContent}>
                  <span>파일 수</span>
                  {sortBy === 'fileCount' && (
                    <span className={styles.sortIcon}>
                      {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                    </span>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedDepts.map((dept) => (
              <tr key={dept.id}>
                <td>{dept.name}</td>
                <td>{dept.userCount}명</td>
                <td>{dept.fileCount}개</td>
              </tr>
            ))}
            {stats && stats.length > 0 && (
              <tr className={styles.totalRow}>
                <td style={{ fontWeight: 700 }}>합계</td>
                <td style={{ fontWeight: 700 }}>
                  {sortedDepts.reduce((sum, dept) => sum + dept.userCount, 0)}명
                </td>
                <td style={{ fontWeight: 700 }}>
                  {sortedDepts.reduce((sum, dept) => sum + dept.fileCount, 0)}개
                </td>
              </tr>
            )}
            {!stats?.length && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: '#999' }}>
                  소속이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default memo(DepartmentStatsSection);
