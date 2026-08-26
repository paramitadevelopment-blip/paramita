'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { formatJuminForDisplay } from '@/lib/columnAliases';
import type { BlacklistRecord } from '@/app/hooks/useBlacklist';
import Pagination from '@/app/components/Pagination/Pagination';
import styles from '../page.module.css';

interface BlacklistSectionProps {
  searchQuery: string;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

/** 두 번호가 같으면 한 번만 보여준다. 같은 값을 두 번 쓰면 읽기만 번잡하다. */
function formatPhones(tel1: string | null, tel2: string | null): string {
  const a = (tel1 ?? '').trim();
  const b = (tel2 ?? '').trim();
  if (!a && !b) return '-';
  if (!a) return b;
  if (!b || a === b) return a;
  return `${a} / ${b}`;
}

/**
 * 블랙리스트 검색 결과.
 *
 * 명단 화면과 달리 해제된 건까지 함께 보여준다(status=all). 검색은 "이 사람
 * 기록이 있나"를 확인하는 자리라, 해제된 건을 숨기면 '기록이 없다'와
 * '풀어줬다'가 같은 화면이 되어 구분할 수 없다. 대신 상태를 배지로 갈라 둔다.
 */
function BlacklistSection({ searchQuery, formatDateTime }: BlacklistSectionProps) {
  const [sortBy, setSortBy] = useState<string>('registered_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-blacklist', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: searchQuery,
        limit: '100',
        page: '1',
        status: 'all',
      });
      const res = await fetch(`/api/blacklist?${params}`, { credentials: 'include' });
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const data: BlacklistRecord[] = response?.data ?? [];

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
      const aVal = a[sortBy as keyof BlacklistRecord];
      const bVal = b[sortBy as keyof BlacklistRecord];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = typeof aVal === 'number' ? aVal : 0;
      const bNum = typeof bVal === 'number' ? bVal : 0;
      return sortOrder === 'asc' ? aNum - bNum : bNum - aNum;
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
    ['tel2', '전화번호'],
    ['request_count', '신청횟수'],
    ['registered_by', '등록경로'],
    ['reason', '사유'],
    ['registered_at', '등록일'],
  ];

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>
        블랙리스트
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
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((record) => (
                <tr key={record.id}>
                  <td>{record.customer_name || '-'}</td>
                  <td>{formatJuminForDisplay(record.birth)}</td>
                  <td>{formatPhones(record.tel1, record.tel2)}</td>
                  <td>{record.request_count === 0 ? '-' : `${record.request_count}회`}</td>
                  <td>{record.registered_by === 'admin' ? '관리자' : '자동'}</td>
                  <td className={styles.reasonCell} title={record.reason}>
                    {record.reason}
                  </td>
                  <td>{formatDateTime(record.registered_at)}</td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${
                        record.released_at ? styles.statusApproved : styles.statusRejected
                      }`}
                    >
                      {record.released_at ? '해제됨' : '차단중'}
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

export default memo(BlacklistSection);
