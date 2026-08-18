'use client';

import React, { memo, useCallback } from 'react';
import { MdNavigateBefore, MdNavigateNext } from 'react-icons/md';
import styles from './Pagination.module.css';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  isLoading: boolean;
}

const Pagination = memo(function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  isLoading,
}: PaginationProps) {
  const handlePrevious = useCallback(() => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  }, [currentPage, onPageChange]);

  const handleNext = useCallback(() => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  }, [currentPage, totalPages, onPageChange]);

  if (totalPages <= 1) return null;

  return (
    <div className={styles.pagination}>
      <button
        onClick={handlePrevious}
        disabled={currentPage === 1 || isLoading}
        className={styles.btn}
      >
        <MdNavigateBefore />
      </button>

      <div className={styles.info}>
        <span>
          {currentPage} / {totalPages}
        </span>
      </div>

      <button
        onClick={handleNext}
        disabled={currentPage === totalPages || isLoading}
        className={styles.btn}
      >
        <MdNavigateNext />
      </button>
    </div>
  );
});

export default Pagination;
