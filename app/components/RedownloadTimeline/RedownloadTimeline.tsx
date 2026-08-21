'use client';

import { useState } from 'react';
import { useRedownloadHistory } from '@/app/hooks/useRedownloadHistory';
import styles from './RedownloadTimeline.module.css';

// 요청은 거부될 때마다 다시 낼 수 있어 이력이 길어진다. 기본은 최근 것만 펴 둔다.
const COLLAPSED_COUNT = 3;

interface RedownloadTimelineProps {
  fileId: string;
  /** 관리자가 남의 이력을 볼 때만 넘긴다. 비관리자는 서버가 본인 것으로 고정한다. */
  userId?: number | null;
  /** 계정이 지워진 사람의 이력을 찾을 때 쓰는 아이디 */
  username?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '거부',
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString('ko-KR').slice(0, -1)} ${date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

export default function RedownloadTimeline({ fileId, userId, username }: RedownloadTimelineProps) {
  const { data: records, isLoading, error } = useRedownloadHistory(fileId, userId, username);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return <div className={styles.empty}>불러오는 중...</div>;
  }

  if (error) {
    return <div className={styles.empty}>이력을 불러올 수 없습니다.</div>;
  }

  if (!records || records.length === 0) {
    return <div className={styles.empty}>요청 이력이 없습니다.</div>;
  }

  const hidden = records.length - COLLAPSED_COUNT;
  const visible = expanded ? records : records.slice(0, COLLAPSED_COUNT);

  return (
    <>
    <ol className={styles.timeline}>
      {visible.map((record, index) => (
        <li key={record.id} className={styles.item}>
          <div className={`${styles.dot} ${styles[record.status]}`} />
          <div className={styles.body}>
            <div className={styles.head}>
              {/* 최신이 위로 오므로 회차는 뒤에서부터 센다. */}
              <span className={styles.round}>{records.length - index}차 요청</span>
              <span className={`${styles.badge} ${styles[record.status]}`}>
                {STATUS_LABEL[record.status] || record.status}
              </span>
              <span className={styles.time}>{formatDateTime(record.requested_at)}</span>
            </div>

            <div className={styles.row}>
              <span className={styles.label}>요청 사유</span>
              <span className={styles.value}>{record.reason || '-'}</span>
            </div>

            {record.status === 'rejected' && (
              <div className={styles.row}>
                <span className={styles.label}>거부 사유</span>
                <span className={`${styles.value} ${styles.rejectReason}`}>
                  {record.review_reason || '-'}
                </span>
              </div>
            )}

            {record.reviewed_at && (
              <div className={styles.row}>
                <span className={styles.label}>처리</span>
                <span className={styles.value}>
                  {record.reviewed_by_name || '-'} · {formatDateTime(record.reviewed_at)}
                </span>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>

    {hidden > 0 && (
      <button className={styles.moreBtn} onClick={() => setExpanded((prev) => !prev)}>
        {expanded ? '접기' : `이전 요청 ${hidden}건 더 보기`}
      </button>
    )}
    </>
  );
}
