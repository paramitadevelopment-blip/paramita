'use client';

import React, { memo } from 'react';
import { MdArrowDropUp, MdArrowDropDown } from 'react-icons/md';
import type { BlacklistRecord } from '@/app/hooks/useBlacklist';
import { formatJuminForDisplay } from '@/lib/columnAliases';
import styles from '../page.module.css';

interface BlacklistTableProps {
  records: BlacklistRecord[];
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
  onRemove: (record: BlacklistRecord) => void;
  isRemoving: boolean;
  onFileNameClick?: (fileId: string, fileName: string) => void;
  onViewReason?: (record: BlacklistRecord) => void;
  onCountClick?: (record: BlacklistRecord) => void;
}

/** 정렬되는 열의 머리말. 같은 마크업이 네 번 반복되던 것을 하나로 모았다. */
const SortableHeader = memo(function SortableHeader({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
}) {
  return (
    <th className={styles.sortableHeader} onClick={() => onSort(column)}>
      <div className={styles.headerContent}>
        <span>{label}</span>
        {sortBy === column && (
          <span className={styles.sortIcon}>
            {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
          </span>
        )}
      </div>
    </th>
  );
});

/**
 * 두 번호가 같으면 한 번만 보여준다. 같은 값을 두 줄로 쓰면 읽기만 번잡하다.
 *
 * 다르면 줄을 나눈다. 슬래시로 이으면 한 줄이 길어져 칸을 밀어내고,
 * 열한 자리 숫자 두 개가 붙어 있어 어디서 끊기는지 눈으로 세야 한다.
 */
function formatPhones(tel1: string | null, tel2: string | null): React.ReactNode {
  const a = (tel1 ?? '').trim();
  const b = (tel2 ?? '').trim();
  if (!a && !b) return '-';
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;

  return (
    <>
      {a}
      <br />
      {b}
    </>
  );
}

/**
 * 명단에 오른 경로를 사람 말로 바꾼다.
 *
 * DB에는 'system'/'admin'으로 들어 있다. 화면 문구를 여기 한 곳에만 두어야
 * 표와 다른 자리가 서로 다른 말을 쓰지 않는다.
 */
function formatRegisteredBy(value: string | null | undefined): string {
  return value === 'admin' ? '관리자' : '자동';
}

/**
 * 출처 목록. 신청 한 건이 한 줄이라 신청횟수와 줄 수가 맞는다.
 *
 * 서버가 아직 목록을 안 주는 경우(옛 응답)에는 등록 당시의 출처 하나로 돌아간다.
 */
function sourceFilesOf(record: BlacklistRecord): Array<{ id: string | null; name: string }> {
  if (record.source_files?.length) return record.source_files;
  return [{ id: record.source_file_id, name: record.source_file_name || '-' }];
}

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.toLocaleDateString('ko-KR').replace(/\.$/, '')} ${d.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

const BlacklistTable = memo(function BlacklistTableComponent({
  records,
  sortBy,
  sortOrder,
  onSort,
  onRemove,
  isRemoving,
  onFileNameClick,
  onViewReason,
  onCountClick,
}: BlacklistTableProps) {
  return (
    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <SortableHeader
              label="고객명"
              column="customer_name"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="생년월일"
              column="birth"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="전화번호"
              column="tel2"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <th
              className={`${styles.sortableHeader} ${styles.countHeader}`}
              onClick={() => onSort('request_count')}
            >
              <div className={styles.headerContent}>
                <span>신청횟수</span>
                {sortBy === 'request_count' && (
                  <span className={styles.sortIcon}>
                    {sortOrder === 'asc' ? <MdArrowDropUp /> : <MdArrowDropDown />}
                  </span>
                )}
              </div>
            </th>
            <SortableHeader
              label="등록경로"
              column="registered_by"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="사유"
              column="reason"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="출처 파일"
              column="source_file_name"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="등록일"
              column="registered_at"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
            <SortableHeader
              label="작업"
              column="released_at"
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={onSort}
            />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className={record.released_at ? styles.rowReleased : undefined}>
              <td className={styles.customerNameCell}>{record.customer_name || '-'}</td>
              <td>{formatJuminForDisplay(record.birth)}</td>
              <td>{formatPhones(record.tel1, record.tel2)}</td>
              <td className={styles.countCell}>
                {record.request_count === 0 ? (
                  <span className={styles.dash}>-</span>
                ) : (
                  <span
                    className={styles.countBadge}
                    onClick={() => onCountClick?.(record)}
                    title="클릭하면 이 사람의 신청 기록을 볼 수 있습니다"
                  >
                    {record.request_count}회
                  </span>
                )}
              </td>
              <td className={styles.byCell}>
                <span
                  className={`${styles.byBadge} ${
                    record.registered_by === 'admin' ? styles.byAdmin : styles.bySystem
                  }`}
                >
                  {formatRegisteredBy(record.registered_by)}
                </span>
              </td>
              <td className={styles.reasonCell} title={record.reason}>
                {record.reason}
              </td>
              <td className={styles.sourceCell}>
                {sourceFilesOf(record).map((file, i) => (
                  <div
                    key={`${file.id ?? '-'}:${i}`}
                    className={file.id ? styles.sourceLine : styles.sourceLineEmpty}
                    title={file.name}
                    onClick={() => {
                      if (file.id && onFileNameClick) onFileNameClick(file.id, file.name);
                    }}
                  >
                    {file.name}
                  </div>
                ))}
              </td>
              <td>{formatDate(record.registered_at)}</td>
              <td>
                {record.released_at ? (
                  <button className={styles.releasedBtn} onClick={() => onViewReason?.(record)}>
                    해제됨
                    <br />
                    (사유보기)
                  </button>
                ) : (
                  <button
                    className={styles.releaseBtn}
                    onClick={() => onRemove(record)}
                    disabled={isRemoving}
                  >
                    해제
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

export default BlacklistTable;
