'use client';

import React, { memo } from 'react';
import { useAuthStore } from '@/app/store/authStore';
import { useReapplyNotices } from '@/app/hooks/useReapplyNotices';
import { useDepartments } from '@/app/hooks/useDepartments';
import { isHiddenDepartment } from '@/lib/departments';
import Spinner from '@/app/components/Spinner/Spinner';
import SearchBar from '@/app/components/SearchBar';
import Pagination from '@/app/components/Pagination/Pagination';
import EmptyState from '@/app/components/EmptyState/EmptyState';
import ReapplyTable from '../components/ReapplyTable';
import styles from '../page.module.css';

/**
 * 내가 받았던 고객 중 다시 신청한 사람들.
 *
 * 30일 중복이나 블랙리스트로 배정에서 빠진 건이라 지사에는 안 넘어간다.
 * 그래도 직전에 그 고객을 받았던 지사는 알아야 다시 연락할 수 있다.
 *
 * 자기 소속만 보이는 건 서버가 거른다. 여기서 가리는 게 아니다.
 */
const ReapplySection = memo(function ReapplySectionComponent() {
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'subadmin';
  const notices = useReapplyNotices();
  // 소속 목록은 관리자만 쓴다. 지사는 자기 것만 보므로 조회할 필요가 없다.
  const { data: departments } = useDepartments(isAdmin);

  /*
   * 배정 분류가 아니라 조직으로 묶는다.
   *
   * 파일에는 '파라인슈1'·'파라인슈2'로 적히지만 사람이 속한 조직은 '파라인슈'
   * 하나다. 분류로 나눠 놓으면 같은 지사 사람이 자기 건을 두 군데서 찾아야 한다.
   */
  const groups = Array.from(
    new Set(
      (departments ?? [])
        .filter((d) => !d.is_admin && !isHiddenDepartment(d.name))
        .map((d) => d.group_name)
    )
  );

  return (
    <>
      <Spinner isLoading={notices.isLoading} />

      <div className={styles.searchSection}>
        <div className={styles.totalCount}>
          총 <span>{notices.pagination?.totalRecords ?? 0}</span>건
        </div>
        <SearchBar
          value={notices.search}
          onChange={notices.setSearch}
          onReset={() => notices.setSearch('')}
        />
      </div>

      <div className={styles.controlsSection}>
        <select
          className={styles.select}
          value={notices.sortBy}
          onChange={(e) => notices.setSortBy(e.target.value)}
        >
          <option value="applied_at">다시 신청한 날순</option>
          <option value="previous_applied_at">이전 배정된 날순</option>
          <option value="customer_name">고객명순</option>
          <option value="birth">생년월일순</option>
          <option value="tel1">전화번호순</option>
          {isAdmin && <option value="assigned_dept">배정 소속순</option>}
          <option value="reason">결과순</option>
          <option value="read_at">확인순</option>
        </select>

        <select
          className={styles.select}
          value={notices.limit}
          onChange={(e) => notices.setLimit(Number(e.target.value))}
        >
          <option value="10">10개씩보기</option>
          <option value="20">20개씩보기</option>
          <option value="30">30개씩보기</option>
          <option value="50">50개씩보기</option>
        </select>
      </div>

      {isAdmin && groups.length > 0 && (
        <div className={styles.departmentsFilter}>
          <button
            className={`${styles.departmentBtn} ${notices.group === '' ? styles.active : ''}`}
            onClick={() => notices.setGroup('')}
          >
            전체
          </button>
          {groups.map((group) => (
            <button
              key={group}
              className={`${styles.departmentBtn} ${notices.group === group ? styles.active : ''}`}
              onClick={() => notices.setGroup(group)}
            >
              {group}
            </button>
          ))}
        </div>
      )}

      <label className={styles.unreadToggle}>
        <input
          type="checkbox"
          checked={notices.unreadOnly}
          onChange={(e) => notices.setUnreadOnly(e.target.checked)}
        />
        아직 확인 안 한 것만 보기
      </label>

      {notices.error ? (
        <EmptyState message="목록을 불러올 수 없습니다." />
      ) : notices.notices.length === 0 ? (
        <EmptyState
          message={
            notices.search
              ? '검색 결과가 없습니다.'
              : notices.unreadOnly
                ? '확인하지 않은 건이 없습니다.'
                : '다시 신청한 고객이 없습니다.'
          }
        />
      ) : (
        <ReapplyTable
          notices={notices.notices}
          sortBy={notices.sortBy}
          sortOrder={notices.sortOrder}
          onSort={notices.toggleSort}
          onRead={notices.markRead}
          isMarking={notices.isMarking}
          showGroup={isAdmin}
        />
      )}

      <Pagination
        currentPage={notices.page}
        totalPages={notices.pagination?.totalPages ?? 1}
        onPageChange={notices.changePage}
        isLoading={notices.isLoading}
      />
    </>
  );
});

export default ReapplySection;
