'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown, MdNotes, MdUndo } from 'react-icons/md';
import { DeletionEvent } from '@/app/hooks/useDeletionHistory';
import { FILE_SOURCE_LABEL } from '@/lib/fileSource';
import styles from '../page.module.css';

/**
 * 이벤트의 출처. 파일전달 삭제는 한 번에 한 건씩만 지우므로(총 1건),
 * 이벤트 안 파일이 섞일 일이 없다 — 하나라도 파일전달이면 그 이벤트 전체가
 * 파일전달에서 난 것이다.
 */
function eventSourceLabel(event: DeletionEvent): string {
  const source = event.files.some((f) => f.source === 'file_transfer')
    ? 'file_transfer'
    : 'direct';
  return FILE_SOURCE_LABEL[source];
}

interface DeletionHistoryTableProps {
  events: DeletionEvent[];
  seqById: Map<number, number>;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onEventClick: (event: DeletionEvent) => void;
  onViewReason: (event: DeletionEvent) => void;
  onRestore: (event: DeletionEvent) => void;
  isRestoring: boolean;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  const dateStr = date.toLocaleDateString('ko-KR').slice(0, -1);
  const timeStr = date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${dateStr} ${timeStr}`;
}

const countCellStyle: React.CSSProperties = {
  color: '#db1a62',
  textDecoration: 'underline',
  cursor: 'pointer',
};

const DeletionHistoryTable = memo(function DeletionHistoryTableComponent({
  events,
  seqById,
  sortBy,
  sortOrder,
  onSort,
  onEventClick,
  onViewReason,
  onRestore,
  isRestoring,
}: DeletionHistoryTableProps) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th style={{ textAlign: 'center', width: '60px' }}>번호</th>
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('deleted_at')}>
              <div className={styles.headerContent}>
                <span>삭제 시간</span>
                {sortBy === 'deleted_at' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('deleted_by')}>
              <div className={styles.headerContent}>
                <span>삭제한 사용자</span>
                {sortBy === 'deleted_by' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('original_count')}>
              <div className={styles.headerContent}>
                <span>원본 파일</span>
                {sortBy === 'original_count' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th style={{ cursor: 'pointer' }} onClick={() => onSort('distributed_count')}>
              <div className={styles.headerContent}>
                <span>배포 파일</span>
                {sortBy === 'distributed_count' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th>
              <div className={styles.headerContent}>
                <span>상태</span>
              </div>
            </th>
            <th>
              <div className={styles.headerContent}>
                <span>출처</span>
              </div>
            </th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const originalCount = event.files.filter((f) => f.is_original).length;
            const distributedCount = event.files.length - originalCount;

            return (
              <tr key={event.id}>
                <td className={styles.numCol} style={{ textAlign: 'center' }}>
                  {seqById.get(event.id)}
                </td>
                <td className={styles.nowrap}>{formatDateTime(event.deleted_at)}</td>
                <td>{event.deleted_by}</td>
                <td
                  style={originalCount > 0 ? countCellStyle : undefined}
                  onClick={(e) => {
                    if (originalCount === 0) return;
                    e.stopPropagation();
                    onEventClick(event);
                  }}
                >
                  {originalCount > 0 ? `${originalCount}건` : '-'}
                </td>
                <td
                  style={distributedCount > 0 ? countCellStyle : undefined}
                  onClick={(e) => {
                    if (distributedCount === 0) return;
                    e.stopPropagation();
                    onEventClick(event);
                  }}
                >
                  {distributedCount > 0 ? `${distributedCount}건` : '-'}
                </td>
                <td>
                  {event.restored_at ? (
                    <span style={{ color: '#27ae60', fontWeight: 600 }}>복구됨</span>
                  ) : (
                    <span style={{ color: '#999' }}>삭제됨</span>
                  )}
                </td>
                <td>{eventSourceLabel(event)}</td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.reasonBtn} onClick={() => onViewReason(event)}>
                      <MdNotes className={styles.btnIcon} />
                      사유보기
                    </button>
                    {!event.restored_at && (
                      <button
                        className={styles.restoreBtn}
                        onClick={() => onRestore(event)}
                        disabled={isRestoring}
                      >
                        <MdUndo className={styles.btnIcon} />
                        복구
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export default DeletionHistoryTable;
