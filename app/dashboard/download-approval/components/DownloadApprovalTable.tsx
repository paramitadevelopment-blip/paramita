'use client';

import { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown, MdCheckCircle, MdBlock, MdDescription } from 'react-icons/md';
import type { RequestRecord } from '../types';
import styles from '../page.module.css';

interface DownloadApprovalTableProps {
  records: RequestRecord[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onApprove: (requestId: number) => void;
  onReject: (requestId: number) => void;
  onRecordClick: (record: RequestRecord) => void;
  onFileNameClick: (fileId: string, fileName: string) => void;
  onReasonClick: (record: RequestRecord) => void;
  isLoading?: boolean;
}

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString('ko-KR').slice(0, -1)} ${date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const getStatusBadgeClass = (status: 'pending' | 'approved' | 'rejected') => {
  switch (status) {
    case 'pending':
      return styles.statusPending;
    case 'approved':
      return styles.statusApproved;
    case 'rejected':
      return styles.statusRejected;
    default:
      return '';
  }
};

const getStatusLabel = (status: 'pending' | 'approved' | 'rejected') => {
  switch (status) {
    case 'pending':
      return '대기';
    case 'approved':
      return '승인';
    case 'rejected':
      return '거부';
    default:
      return status;
  }
};

const DownloadApprovalTable = memo(function DownloadApprovalTable({
  records,
  sortBy,
  sortOrder,
  onSort,
  onApprove,
  onReject,
  onRecordClick,
  onFileNameClick,
  onReasonClick,
  isLoading = false,
}: DownloadApprovalTableProps) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={`${styles.sortable} ${styles.colRequester}`} onClick={() => onSort('user_name')}>
              <div className={styles.headerContent}>
                <span>요청자</span>
                {sortBy === 'user_name' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortable} onClick={() => onSort('file_name')}>
              <div className={styles.headerContent}>
                <span>파일명</span>
                {sortBy === 'file_name' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th>
              <div className={styles.headerContent}>
                <span>요청 사유</span>
              </div>
            </th>
            <th className={`${styles.sortable} ${styles.colRejectCount}`} onClick={() => onSort('file_reject_count')}>
              <div className={styles.headerContent}>
                <span>거부 횟수</span>
                {sortBy === 'file_reject_count' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortable} onClick={() => onSort('requested_at')}>
              <div className={styles.headerContent}>
                <span>요청 시간</span>
                {sortBy === 'requested_at' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.sortable} onClick={() => onSort('status')}>
              <div className={styles.headerContent}>
                <span>상태</span>
                {sortBy === 'status' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <th className={styles.colActions}>작업</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr
              key={record.id}
              className={styles.clickableRow}
              onClick={() => onRecordClick(record)}
            >
              <td>
                <div className={styles.requesterName}>{record.user_username || '-'}</div>
              </td>
              <td
                className={styles.fileNameCell}
                onClick={(e) => {
                  e.stopPropagation();
                  onFileNameClick(record.file_id, record.file_name);
                }}
              >
                {record.file_name}
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                {record.reason || record.review_reason ? (
                  <button
                    className={styles.reasonBtn}
                    onClick={() => onReasonClick(record)}
                  >
                    <MdDescription />
                    <span>사유 보기</span>
                  </button>
                ) : (
                  '-'
                )}
              </td>
              <td>
                <span
                  className={`${styles.rejectCount} ${record.file_reject_count > 0 ? styles.rejectCountWarn : ''}`}
                >
                  {record.file_reject_count}회
                </span>
              </td>
              <td>
                <div className={styles.eventTime}>요청 {formatDateTime(record.requested_at)}</div>
                {record.reviewed_at && (
                  <div className={styles.eventTimeSub}>
                    {record.status === 'approved' ? '승인' : '거부'} {formatDateTime(record.reviewed_at)}
                  </div>
                )}
              </td>
              <td>
                <span className={`${styles.statusBadge} ${getStatusBadgeClass(record.status)}`}>
                  {getStatusLabel(record.status)}
                </span>
              </td>
              <td className={styles.colActions} onClick={(e) => e.stopPropagation()}>
                {record.status === 'pending' && (
                  <div className={styles.actionButtons}>
                    <button
                      className={`${styles.iconBtn} ${styles.approve}`}
                      onClick={() => onApprove(record.id)}
                      disabled={isLoading}
                      title="승인"
                    >
                      <MdCheckCircle />
                      <span>승인</span>
                    </button>
                    <button
                      className={`${styles.iconBtn} ${styles.reject}`}
                      onClick={() => onReject(record.id)}
                      disabled={isLoading}
                      title="거부"
                    >
                      <MdBlock />
                      <span>거부</span>
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default DownloadApprovalTable;
