'use client';

import { memo } from 'react';
import { MdChevronLeft, MdChevronRight } from 'react-icons/md';
import styles from '../page.module.css';

interface FilePagerProps {
  fileName: string;
  currentIndex: number;
  totalFiles: number;
  onChangeIndex: (updater: (i: number) => number) => void;
}

/** 파일을 여러 개 올렸을 때 결과를 하나씩 넘겨 보는 줄. */
const FilePager = memo(function FilePagerComponent({
  fileName,
  currentIndex,
  totalFiles,
  onChangeIndex,
}: FilePagerProps) {
  return (
    <div className={styles.filePager}>
      <button
        type="button"
        className={styles.filePagerBtn}
        onClick={() => onChangeIndex((i) => i - 1)}
        disabled={currentIndex === 0}
        aria-label="이전 파일"
      >
        <MdChevronLeft />
      </button>

      <div className={styles.filePagerInfo}>
        <span className={styles.filePagerName} title={fileName}>
          {fileName}
        </span>
        <span className={styles.filePagerCount}>
          {currentIndex + 1}/{totalFiles}
        </span>
      </div>

      <button
        type="button"
        className={styles.filePagerBtn}
        onClick={() => onChangeIndex((i) => i + 1)}
        disabled={currentIndex >= totalFiles - 1}
        aria-label="다음 파일"
      >
        <MdChevronRight />
      </button>
    </div>
  );
});

export default FilePager;
