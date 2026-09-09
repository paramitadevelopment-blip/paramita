'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import { COMPLAINT_STATUS_LABEL } from '@/lib/complaints';
import { GIFT_STATUS_LABEL } from '@/lib/gifts';
import Pagination from '@/app/components/Pagination/Pagination';
import styles from '../page.module.css';

/**
 * 지워진 민원·사은품.
 *
 * 관리자가 지우면 그 줄이 통째로 보관본에 남지만 볼 방법이 없었다 — 보관해
 * 두고 못 보면 안 남긴 것과 같다. "이 고객 민원 어디 갔지?"가 실제로 묻는
 * 말이라, 목록에서 사라진 건을 여기서 찾는다.
 *
 * 되살리지는 못한다. "무엇을 누가 왜 지웠나"에 답할 수 있으면 된다.
 */

interface DeletedRecord {
  id: string;
  kind: 'complaint' | 'gift';
  kindLabel: string;
  originalId: number;
  customerName: string | null;
  phone: string | null;
  orderNo: string | null;
  group: string | null;
  summary: string | null;
  status: string | null;
  createdAt: string | null;
  reason: string;
  deletedBy: string;
  deletedAt: string;
}

interface DeletedRecordsSectionProps {
  searchQuery: string;
  formatDateTime: (dateString: string) => string;
}

const ITEMS_PER_PAGE = 10;

/** 지워질 때의 상태를 사람 말로. 두 흐름의 상태말이 서로 다르다. */
function statusText(row: DeletedRecord): string {
  if (!row.status) return '-';
  const label =
    row.kind === 'complaint'
      ? COMPLAINT_STATUS_LABEL[row.status as keyof typeof COMPLAINT_STATUS_LABEL]
      : GIFT_STATUS_LABEL[row.status as keyof typeof GIFT_STATUS_LABEL];
  return label ?? row.status;
}

function DeletedRecordsSection({ searchQuery, formatDateTime }: DeletedRecordsSectionProps) {
  const [sortBy, setSortBy] = useState<string>('deletedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery({
    queryKey: ['search-deleted-records', searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ search: searchQuery, limit: '100' });
      const res = await fetch(`/api/deleted-records?${params}`, { credentials: 'include' });
      // 관리자가 아니면 403이 온다. 빈 결과로 두면 화면이 조용히 지나간다.
      if (!res.ok) return { data: [] };
      return res.json();
    },
    enabled: searchQuery.length > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const data: DeletedRecord[] = response?.data ?? [];

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
      const aVal = a[sortBy as keyof DeletedRecord];
      const bVal = b[sortBy as keyof DeletedRecord];
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
    ['kindLabel', '종류'],
    ['customerName', '고객명'],
    ['phone', '전화번호'],
    ['orderNo', '주문번호'],
    ['group', '소속'],
    ['summary', '내용'],
    ['status', '지울 때 상태'],
    ['reason', '삭제 사유'],
    ['deletedBy', '지운 사람'],
    ['deletedAt', '지운 시각'],
  ];

  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>
        지워진 민원·사은품
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
                  <td>
                    <span className={styles.statusBadge}>{row.kindLabel}</span>
                  </td>
                  <td>{row.customerName || '-'}</td>
                  <td>{row.phone || '-'}</td>
                  <td>{row.orderNo || '-'}</td>
                  <td>{row.group || '-'}</td>
                  {/* 통화내역·사은품명은 길이를 예측할 수 없다. 한 줄로 자르고 전체는 title로. */}
                  <td className={styles.reasonCell} title={row.summary || ''}>
                    {row.summary || '-'}
                  </td>
                  <td>{statusText(row)}</td>
                  <td className={styles.reasonCell} title={row.reason}>
                    {row.reason}
                  </td>
                  <td>{row.deletedBy}</td>
                  <td>{formatDateTime(row.deletedAt)}</td>
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

export default memo(DeletedRecordsSection);
