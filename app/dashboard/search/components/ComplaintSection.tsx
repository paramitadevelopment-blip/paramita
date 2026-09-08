'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { COMPLAINT_STATUS_LABEL, type ComplaintRow } from '@/lib/complaints';
import Pagination from '@/app/components/Pagination/Pagination';
import styles from '../page.module.css';

interface ComplaintSectionProps {
  searchQuery: string;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

/**
 * 민원 검색 결과.
 *
 * 목록 API가 그대로 검색을 받는다 — 고객명·전화·주문번호뿐 아니라 통화내역·
 * 처리 내용·담당 지사·상태말·날짜까지 훑는다(lib/listSearch.ts). 여기서
 * 조건을 다시 짜지 않고 그 API를 부른다. 보이는 범위도 서버가 정한다:
 * 관리자는 전부, 지사는 자기 소속, 넣기만 하는 사람은 자기가 넣은 것.
 */
function ComplaintSection({ searchQuery, formatDateTime }: ComplaintSectionProps) {
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-complaints', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ search: searchQuery, limit: '100', page: '1' });
      const res = await fetch(`/api/complaints?${params}`, { credentials: 'include' });
      // 볼 수 없는 사람에게는 403이 온다. 빈 결과로 두면 화면이 조용히 지나간다.
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const data: ComplaintRow[] = response?.data ?? [];

  const handleSort = useCallback(
    (column: string) => {
      if (sortBy === column) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      else {
        setSortBy(column);
        setSortOrder('asc');
      }
    },
    [sortBy, sortOrder]
  );

  const sortedData = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
      const aVal = a[sortBy as keyof ComplaintRow];
      const bVal = b[sortBy as keyof ComplaintRow];
      // 빈 값은 방향과 상관없이 뒤로. 안 그러면 내림차순에서 빈 줄이 맨 위로 온다.
      if (!aVal && bVal) return 1;
      if (aVal && !bVal) return -1;
      if (!aVal && !bVal) return 0;
      const gap = String(aVal).localeCompare(String(bVal), 'ko');
      return sortOrder === 'asc' ? gap : -gap;
    });
    return sorted;
  }, [data, sortBy, sortOrder]);

  const paginatedData = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return sortedData.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedData, page]);

  if (!searchQuery) return null;

  const columns: Array<[string, string]> = [
    ['created_at', '등록일'],
    ['customer_name', '수령인'],
    ['phone', '전화번호'],
    ['order_no', '주문번호'],
    ['assigned_group', '담당 지사'],
    ['call_memo', '통화내역'],
    ['status', '상태'],
    ['handled_note', '처리 내용'],
  ];

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>
        민원
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
              {paginatedData.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.created_at)}</td>
                  <td>{row.customer_name}</td>
                  <td>{row.phone || '-'}</td>
                  <td>{row.order_no || '-'}</td>
                  <td>{row.assigned_group || '-'}</td>
                  {/* 통화내역·처리 내용은 길이를 예측할 수 없다. 한 줄로 자르고 전체는 title로. */}
                  <td className={styles.reasonCell} title={row.call_memo || ''}>
                    {row.call_memo || '-'}
                  </td>
                  <td>
                    <span className={styles.statusBadge}>
                      {COMPLAINT_STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className={styles.reasonCell} title={row.handled_note || ''}>
                    {row.handled_note || '-'}
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

export default memo(ComplaintSection);
