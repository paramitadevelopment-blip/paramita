'use client';

import type { ClassifiedFile } from '@/app/hooks/useAutoClassify';
import styles from '../page.module.css';

interface PreviewTarget {
  title: string;
  headers: string[];
  rows: any[][];
}

interface FileSummaryButtonsProps {
  current: ClassifiedFile;
  onPreview: (target: PreviewTarget) => void;
}

/**
 * 한 파일의 건수 요약 세 칸. 누르면 그 목록을 미리보기로 연다.
 *
 * 건수가 0이면 눌러도 빈 표만 뜨므로 커서를 바꿔 누를 게 없다는 걸 알린다.
 */
export default function FileSummaryButtons({ current, onPreview }: FileSummaryButtonsProps) {
  const sections = [
    // 원본은 전체 행 수를 보여준다. 목록은 미리보기용 원본 행이라 건수와 길이가 다를 수 있다.
    {
      label: '원본 데이터',
      count: current.totalRows,
      rows: current.originalRows,
      headers: current.previewHeaders,
      title: '원본 데이터',
    },
    {
      label: '분류 결과',
      count: current.processedRows.length,
      rows: current.processedRows,
      headers: current.processedHeaders,
      title: '분류 결과',
    },
    {
      label: '중복',
      count: current.duplicateRows.length,
      rows: current.duplicateRows,
      headers: current.duplicateHeaders,
      title: '중복',
    },
  ];

  return (
    <div className={styles.resultGridLeft}>
      {sections.map((section) => (
        <button
          key={section.label}
          className={styles.originalDataInfo}
          style={{ cursor: section.rows.length > 0 ? 'pointer' : 'default', padding: '12px', textAlign: 'center', border: 'none', background: 'transparent' }}
          onClick={() => {
            if (section.rows.length === 0) return;
            onPreview({
              title: `${current.fileName} — ${section.title}`,
              headers: section.headers,
              rows: section.rows,
            });
          }}
        >
          <div className={styles.resultLabel}>{section.label}</div>
          <div className={styles.resultCount}>{section.count}건</div>
        </button>
      ))}
    </div>
  );
}
