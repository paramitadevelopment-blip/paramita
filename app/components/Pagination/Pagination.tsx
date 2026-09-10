'use client';

import React, { memo, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { pageWindow } from '@/lib/pageWindow';
import styles from './Pagination.module.css';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  style?: React.CSSProperties;
}

const Pagination = memo(function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
  style,
}: PaginationProps) {
  const handleFirst = useCallback(() => {
    onPageChange(1);
  }, [onPageChange]);

  const handlePrevious = useCallback(() => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  }, [currentPage, onPageChange]);

  const handleNext = useCallback(() => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  }, [currentPage, totalPages, onPageChange]);

  const handleLast = useCallback(() => {
    onPageChange(totalPages);
  }, [totalPages, onPageChange]);

  /*
   * 번호는 지금 쪽 둘레만 그리고 사이는 '…'으로 접는다(lib/pageWindow.ts).
   * 전부 그리면 백 쪽일 때 번호가 백 개 늘어서서 줄이 화면을 넘고, 다음 쪽으로
   * 넘어가려는 화살표까지 밀려난다.
   */
  const pages = useMemo(() => pageWindow(currentPage, totalPages), [currentPage, totalPages]);

  return (
    <div className={styles.pagination} style={style}>
      <button
        onClick={handleFirst}
        disabled={currentPage === 1 || isLoading}
        className={`${styles.btn} ${styles.arrow}`}
        title="첫 페이지"
      >
        <Image
          src="/arrow/arrow2.png"
          alt="첫 페이지"
          width={20}
          height={20}
          unoptimized
          style={{ transform: 'rotate(180deg)', width: 'auto', height: 'auto' }}
        />
      </button>

      <button
        onClick={handlePrevious}
        disabled={currentPage === 1 || isLoading}
        className={`${styles.btn} ${styles.arrow}`}
        title="이전 페이지"
      >
        <Image
          src="/arrow/arrow1.png"
          alt="이전"
          width={12}
          height={12}
          unoptimized
          style={{ transform: 'rotate(180deg)', width: 'auto', height: 'auto' }}
        />
      </button>

      <div className={styles.pageNumbers}>
        {pages.map((page, at) =>
          page === 'gap' ? (
            <span key={`gap-${at}`} className={styles.gap} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              disabled={isLoading}
              className={`${styles.pageBtn} ${currentPage === page ? styles.active : ''}`}
              aria-current={currentPage === page ? 'page' : undefined}
            >
              {page}
            </button>
          )
        )}
      </div>

      <button
        onClick={handleNext}
        disabled={currentPage === totalPages || isLoading}
        className={`${styles.btn} ${styles.arrow}`}
        title="다음 페이지"
      >
        <Image
          src="/arrow/arrow1.png"
          alt="다음"
          width={12}
          height={12}
          unoptimized
          style={{ width: 'auto', height: 'auto' }}
        />
      </button>

      <button
        onClick={handleLast}
        disabled={currentPage === totalPages || isLoading}
        className={`${styles.btn} ${styles.arrow}`}
        title="마지막 페이지"
      >
        <Image
          src="/arrow/arrow2.png"
          alt="마지막 페이지"
          width={20}
          height={20}
          unoptimized
          style={{ width: 'auto', height: 'auto' }}
        />
      </button>
    </div>
  );
});

export default Pagination;
