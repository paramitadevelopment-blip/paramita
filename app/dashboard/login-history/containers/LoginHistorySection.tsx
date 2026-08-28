'use client';

import React, { memo } from 'react';
import { useLoginRecords, type LoginStatus } from '@/app/hooks/useLoginRecords';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import LoginTable from '../components/LoginTable';
import styles from '../page.module.css';

/**
 * 누가 언제 어디서 들어왔나.
 *
 * 실패한 시도도 함께 남는다. 성공 사이에 섞여 있으면 눈에 안 들어와서
 * 실패만 모아 보는 갈래를 따로 뒀다.
 */
const 갈래: Array<[LoginStatus, string]> = [
  ['all', '전체'],
  ['success', '성공'],
  ['failed', '실패'],
];

const LoginHistorySection = memo(function LoginHistorySectionComponent() {
  const login = useLoginRecords();

  return (
    <>
      <Spinner isLoading={login.isLoading} />

      <div className={styles.searchSection}>
        <div className={styles.totalCount}>
          총 <span>{login.pagination?.totalRecords ?? 0}</span>건
        </div>
        <SearchBar
          value={login.search}
          onChange={login.setSearch}
          onReset={() => login.setSearch('')}
        />
      </div>

      <div className={styles.controlsSection}>
        <select
          className={styles.select}
          value={login.sortBy}
          onChange={(e) => login.setSortBy(e.target.value)}
        >
          <option value="logged_in_at">시각순</option>
          <option value="username">아이디순</option>
          <option value="user_department">소속순</option>
          <option value="ip_address">IP순</option>
          <option value="success">결과순</option>
          <option value="device">기기순</option>
        </select>

        <select
          className={styles.select}
          value={login.limit}
          onChange={(e) => login.setLimit(Number(e.target.value))}
        >
          <option value="20">20개씩보기</option>
          <option value="50">50개씩보기</option>
          <option value="100">100개씩보기</option>
        </select>
      </div>

      <div className={styles.statusFilter}>
        {갈래.map(([value, label]) => (
          <button
            key={value}
            className={`${styles.statusBtn} ${login.status === value ? styles.active : ''}`}
            onClick={() => login.setStatus(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {login.error ? (
        <EmptyState message="기록을 불러올 수 없습니다." />
      ) : login.records.length === 0 ? (
        <EmptyState
          message={
            login.search
              ? '검색 결과가 없습니다.'
              : login.status === 'failed'
                ? '실패한 로그인이 없습니다.'
                : '로그인 기록이 없습니다.'
          }
        />
      ) : (
        <LoginTable
          records={login.records}
          sortBy={login.sortBy}
          sortOrder={login.sortOrder}
          onSort={login.toggleSort}
        />
      )}

      <Pagination
        currentPage={login.page}
        totalPages={login.pagination?.totalPages ?? 1}
        onPageChange={login.changePage}
        isLoading={login.isLoading}
      />
    </>
  );
});

export default LoginHistorySection;
