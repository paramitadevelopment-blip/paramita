'use client';

import React, { memo } from 'react';
import type { BlacklistRecord } from '@/app/hooks/useBlacklist';
import styles from '../page.module.css';

interface ReleaseInfoModalProps {
  record: BlacklistRecord;
  onClose: () => void;
}

/**
 * 언제 왜 풀렸는지.
 *
 * 명단은 한 번 오르면 자동으로 안 풀리므로, 풀린 건은 반드시 사람이 손을 댄
 * 것이다. 그 판단이 옳았는지 나중에 되짚으려면 시각·사유·전체 이력이 남아야 한다.
 */
const ReleaseInfoModal = memo(function ReleaseInfoModalComponent({
  record,
  onClose,
}: ReleaseInfoModalProps) {
  const history = record.history ?? [];

  return (
    <div className={styles.modal}>
      <div className={styles.reasonModalContent}>
        <div className={styles.reasonModalHeader}>
          <h2>해제 정보</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.reasonSection}>
          <div className={styles.field}>
            <div className={styles.reasonLabel}>해제 시간</div>
            <div className={`${styles.reasonModalBody} ${styles.reasonTimeBody}`}>
              {record.released_at
                ? new Date(record.released_at).toLocaleString('ko-KR')
                : '(기록 없음)'}
            </div>
          </div>
          <div className={styles.field}>
            <div className={styles.reasonLabel}>해제 사유</div>
            <div className={`${styles.reasonModalBody} ${styles.reasonTextBody}`}>
              {record.release_reason || '(사유 없음)'}
            </div>
          </div>
        </div>

        {history.length > 0 && (
          <div>
            <div className={styles.allHistoryTitle}>전체 이력</div>
            <div className={styles.allHistoryList}>
              {history.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.allHistoryItem} ${
                    item.action === 'released' ? styles.allHistoryReleased : styles.allHistoryRegistered
                  }`}
                >
                  <div className={styles.allHistoryHead}>
                    <span
                      className={`${styles.actionBadge} ${
                        item.action === 'released' ? styles.actionReleased : styles.actionRegistered
                      }`}
                    >
                      {item.action === 'released' ? '해제' : '등록'}
                    </span>
                    <span className={styles.allHistoryTime}>
                      {new Date(item.created_at).toLocaleString('ko-KR')}
                    </span>
                  </div>
                  {item.reason && <div className={styles.allHistoryReason}>{item.reason}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          className={`${styles.userModalCloseBtn} ${styles.reasonCloseBtn}`}
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </div>
  );
});

export default ReleaseInfoModal;
