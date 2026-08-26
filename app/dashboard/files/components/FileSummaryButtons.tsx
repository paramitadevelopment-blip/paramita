'use client';

import type { ClassifiedFile } from '@/app/hooks/useAutoClassify';
import { splitDuplicatesByGroup } from '@/lib/duplicateSummary';
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
 * 한 파일의 건수 요약. 누르면 그 목록을 미리보기로 연다.
 *
 * 중복은 한 칸으로 합치지 않고 갈래별로 나눈다 — 중복1·중복2·중복3·블랙리스트는
 * 서로 다른 이유로 걸러낸 것이라, 합쳐 놓으면 "왜 빠졌나"를 알려면 표를 훑어야 하고
 * 규칙 하나만 확인하고 싶을 때 걸러낼 방법이 없다. 엑셀 시트도 같은 이름으로 갈린다.
 *
 * 건수가 0이면 눌러도 빈 표만 뜨므로 커서를 바꿔 누를 게 없다는 걸 알린다.
 */
export default function FileSummaryButtons({ current, onPreview }: FileSummaryButtonsProps) {
  const sections = [
    // 올린 파일 그대로 보여준다 — 열 이름을 바꾸기도, 중복을 걷어내기도 전.
    // 관리자가 엑셀을 켜놓고 대조할 수 있어야 매핑이 틀린 걸 잡을 수 있다.
    {
      label: '원본 데이터',
      count: current.totalRows,
      rows: current.originalRows,
      headers: current.originalHeaders,
      title: '원본 데이터',
    },
    {
      label: '분류 결과',
      count: current.processedRows.length,
      rows: current.processedRows,
      headers: current.processedHeaders,
      title: '분류 결과',
    },
    // 중복1 · 중복2 · 중복3 · 블랙리스트
    ...splitDuplicatesByGroup(current.duplicateRows).map((group) => ({
      label: group.sheet,
      count: group.rows.length,
      rows: group.rows,
      headers: current.duplicateHeaders,
      title: group.sheet,
    })),
  ];

  return (
    <div className={styles.resultGridLeft}>
      {sections.map((section) => (
        <button
          key={section.label}
          className={`${styles.originalDataInfo} ${styles.summaryBtn} ${
            section.rows.length === 0 ? styles.summaryBtnEmpty : ''
          }`}
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
