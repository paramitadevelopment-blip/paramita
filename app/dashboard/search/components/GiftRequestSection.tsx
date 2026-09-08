'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { GIFT_STATUS_LABEL, type GiftRequestRow } from '@/lib/gifts';
import Pagination from '@/app/components/Pagination/Pagination';
import styles from '../page.module.css';

interface GiftRequestSectionProps {
  searchQuery: string;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

/**
 * 사은품 신청 검색 결과.
 *
 * 목록 API가 상세에 뜨는 글자 칸을 전부 훑는다 — 고객명·주소·사은품·주문번호·
 * 운송장·상담원·상태말·날짜까지(lib/listSearch.ts). 여기서 조건을 다시 짜지
 * 않고 그 API를 부른다. 보이는 범위도 서버가 정한다: 관리자·담당자는 전부,
 * 지사는 자기 소속 것.
 */
function GiftRequestSection({ searchQuery, formatDateTime }: GiftRequestSectionProps) {
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-gift-requests', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ search: searchQuery, limit: '100', page: '1' });
      const res = await fetch(`/api/gift-requests?${params}`, { credentials: 'include' });
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const data: GiftRequestRow[] = response?.data ?? [];

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
      const aVal = a[sortBy as keyof GiftRequestRow];
      const bVal = b[sortBy as keyof GiftRequestRow];
      // 빈 값은 방향과 상관없이 뒤로.
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
    ['created_at', '신청일'],
    ['customer_name', '고객명'],
    ['phone1', '전화번호'],
    ['order_no', '주문번호'],
    ['gift_name', '사은품'],
    ['group_name', '지사'],
    ['status', '상태'],
    ['courier', '택배사'],
    ['tracking_no', '운송장번호'],
  ];

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>
        사은품 신청
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
                  <td>{row.phone1 || '-'}</td>
                  <td>{row.order_no || '-'}</td>
                  <td>
                    {row.gift_name}
                    {row.quantity > 1 && ` ×${row.quantity}`}
                  </td>
                  <td>{row.group_name || '-'}</td>
                  <td>
                    <span className={styles.statusBadge}>
                      {GIFT_STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td>{row.courier || '-'}</td>
                  <td>{row.tracking_no || '-'}</td>
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

export default memo(GiftRequestSection);
