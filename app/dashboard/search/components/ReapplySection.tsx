'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { formatJuminForDisplay } from '@/lib/columnAliases';
import type { ReapplyNotice } from '@/app/hooks/useReapplyNotices';
import Pagination from '@/app/components/Pagination/Pagination';
import styles from '../page.module.css';

interface ReapplySectionProps {
  searchQuery: string;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

/** 두 번호가 같으면 한 번만 보여준다. */
function formatPhones(tel1: string | null, tel2: string | null): string {
  const a = (tel1 ?? '').trim();
  const b = (tel2 ?? '').trim();
  if (!a && !b) return '-';
  if (!a) return b;
  if (!b || a === b) return a;
  return `${a} / ${b}`;
}

/**
 * 사유를 짧게 줄인다. 표에서는 무엇 때문에 빠졌는지만 알면 되고,
 * 전체 문구는 title로 남긴다.
 */
function shortReason(reason: string): string {
  if (reason.startsWith('30일 내 이름+전화')) return '중복 (이름+전화)';
  if (reason.startsWith('30일 내 이름+생년월일')) return '중복 (번호 교차)';
  if (reason.startsWith('블랙리스트')) return '블랙리스트';
  if (reason.startsWith('60일 내 3회')) return '블랙리스트 (3회)';
  return reason;
}

/**
 * 재신청 고객 검색 결과.
 *
 * 검색 화면은 관리자 전용이라 소속을 가리지 않고 전부 본다. "이 고객이 다시
 * 신청한 적 있나, 그때 어느 지사가 받았었나"를 한 번에 확인하는 자리다.
 */
function ReapplySection({ searchQuery, formatDateTime }: ReapplySectionProps) {
  const [sortBy, setSortBy] = useState<string>('applied_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-reapply', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '100',
        page: '1',
      });
      const res = await fetch(`/api/reapply-notices?${params}`, { credentials: 'include' });
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const data: ReapplyNotice[] = response?.data ?? [];

  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setSortBy(column);
        setSortOrder('asc');
      }
    },
    [sortBy, sortOrder]
  );

  const sortedData = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
      const aVal = a[sortBy as keyof ReapplyNotice];
      const bVal = b[sortBy as keyof ReapplyNotice];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      if (!aVal && bVal) return sortOrder === 'asc' ? 1 : -1;
      if (aVal && !bVal) return sortOrder === 'asc' ? -1 : 1;
      return 0;
    });
    return sorted;
  }, [data, sortBy, sortOrder]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedData.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedData, page]);

  if (!searchQuery) return null;

  const columns: Array<[string, string]> = [
    ['customer_name', '고객명'],
    ['birth', '생년월일'],
    ['tel1', '전화번호'],
    ['previous_applied_at', '이전 배정된 날'],
    ['assigned_dept', '배정 소속'],
    ['applied_at', '다시 신청한 날'],
    ['reason', '결과'],
    ['read_at', '확인'],
  ];

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>
        재신청 고객
        <span className={styles.sectionCount}>({data.length}건)</span>
      </h2>

      {data.length > 0 ? (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                {columns.map(([column, label]) => (
                  <th key={column} className={styles.sortable} onClick={() => handleSort(column)}>
                    <div className={styles.headerContent}>
                      <span>{label}</span>
                      {sortBy === column && (
                        <span className={styles.sortIcon}>
                          {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((notice) => (
                <tr key={notice.id}>
                  <td>{notice.customer_name || '-'}</td>
                  <td>{formatJuminForDisplay(notice.birth)}</td>
                  <td>{formatPhones(notice.tel1, notice.tel2)}</td>
                  <td>
                    {notice.previous_applied_at ? formatDateTime(notice.previous_applied_at) : '-'}
                  </td>
                  <td>{notice.assigned_dept}</td>
                  <td>{formatDateTime(notice.applied_at)}</td>
                  <td className={styles.reasonCell} title={notice.reason}>
                    {shortReason(notice.reason)}
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        notice.read_at ? styles.statusApproved : styles.statusPending
                      }`}
                    >
                      {notice.read_at ? '확인함' : '미확인'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination
            currentPage={page}
            totalPages={Math.ceil(sortedData.length / ITEMS_PER_PAGE)}
            onPageChange={setPage}
            isLoading={isLoading}
          />
        </>
      ) : (
        <div className={styles.noResults}>검색 결과 없음</div>
      )}
    </div>
  );
}

export default memo(ReapplySection);
