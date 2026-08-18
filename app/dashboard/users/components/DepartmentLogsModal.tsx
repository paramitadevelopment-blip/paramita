'use client';

import { memo, useState, useMemo, useEffect } from 'react';
import { MdClose, MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import Pagination from '@/app/components/Pagination/Pagination';
import { useDepartmentLogs } from '@/app/hooks/useDepartmentLogs';
import styles from './DepartmentLogsModal.module.css';

interface DepartmentLogsModalProps {
  userId: number | null;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
}

const REASON_LABEL = {
  department_deleted: '소속 삭제',
  manual_edit: '관리자 수정',
} as const;

const ITEMS_PER_PAGE = 5;

type SortColumn = 'changed_at' | 'reason' | 'changed_by';

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

const DepartmentLogsModal = memo(function DepartmentLogsModal({
  userId,
  userName,
  isOpen,
  onClose,
}: DepartmentLogsModalProps) {
  const { data: logs = [], isLoading } = useDepartmentLogs(userId, isOpen);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortColumn>('changed_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // 다른 사용자의 이력을 열면 정렬·페이지를 초기 상태로 되돌린다.
  useEffect(() => {
    setPage(1);
    setSortBy('changed_at');
    setSortOrder('desc');
  }, [userId]);

  // 번호는 "몇 번째 변경인가"를 뜻하므로 화면 정렬과 무관하게 시간순으로 고정한다.
  const seqById = useMemo(() => {
    const chronological = [...logs].sort((a, b) => {
      const diff = new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime();
      return diff !== 0 ? diff : a.id - b.id;
    });

    return new Map(chronological.map((log, idx) => [log.id, idx + 1]));
  }, [logs]);

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => {
      let compared = 0;

      if (sortBy === 'changed_at') {
        compared = new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime();
      } else if (sortBy === 'reason') {
        compared = (REASON_LABEL[a.reason] ?? a.reason).localeCompare(REASON_LABEL[b.reason] ?? b.reason, 'ko');
      } else {
        compared = (a.changed_by || '').localeCompare(b.changed_by || '', 'ko');
      }

      return sortOrder === 'asc' ? compared : -compared;
    });
  }, [logs, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedLogs.length / ITEMS_PER_PAGE));
  const startIndex = (page - 1) * ITEMS_PER_PAGE;
  const currentLogs = sortedLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const renderSortIcon = (column: SortColumn) => {
    if (sortBy !== column) return null;
    return (
      <span className={styles.sortIcon}>
        {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
      </span>
    );
  };

  if (!isOpen || !userId) return null;

  return (
    // 배경 클릭으로는 닫지 않는다. 닫기 버튼으로만 닫는다.
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{userName} - 소속 변경 이력</h2>
          <button className={styles.closeBtn} onClick={onClose} title="닫기">
            <MdClose />
          </button>
        </div>

        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.empty}>로드 중...</div>
          ) : logs.length === 0 ? (
            <div className={styles.empty}>소속 변경 이력이 없습니다.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.numCol}>번호</th>
                  <th>변경 내용</th>
                  <th className={styles.sortable} onClick={() => handleSort('reason')}>
                    <div className={styles.headerContent}>
                      <span>사유</span>
                      {renderSortIcon('reason')}
                    </div>
                  </th>
                  <th className={styles.sortable} onClick={() => handleSort('changed_by')}>
                    <div className={styles.headerContent}>
                      <span>변경자</span>
                      {renderSortIcon('changed_by')}
                    </div>
                  </th>
                  <th className={styles.sortable} onClick={() => handleSort('changed_at')}>
                    <div className={styles.headerContent}>
                      <span>변경 시각</span>
                      {renderSortIcon('changed_at')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentLogs.map((log) => (
                  <tr key={log.id}>
                    <td className={styles.numCol}>{seqById.get(log.id)}</td>
                    <td>
                      <span className={styles.from}>{log.from_department || '-'}</span>
                      <span className={styles.arrow}>→</span>
                      <span className={styles.to}>{log.to_department || '-'}</span>
                    </td>
                    <td>
                      <span
                        className={`${styles.reason} ${
                          log.reason === 'department_deleted' ? styles.reasonDeleted : styles.reasonManual
                        }`}
                      >
                        {REASON_LABEL[log.reason] ?? log.reason}
                      </span>
                    </td>
                    <td>{log.changed_by || '-'}</td>
                    <td>{formatDateTime(log.changed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={styles.footer}>
          {sortedLogs.length > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={setPage}
              isLoading={isLoading}
              style={{ marginBottom: '20px' }}
            />
          )}
          <button className={styles.footerBtn} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
});

export default DepartmentLogsModal;
