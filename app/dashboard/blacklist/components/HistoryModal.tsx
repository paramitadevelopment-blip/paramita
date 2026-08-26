'use client';

import React, { memo } from 'react';
import { formatJuminForDisplay } from '@/lib/columnAliases';
import type { BlacklistRecord } from '@/app/hooks/useBlacklist';
import styles from '../page.module.css';

interface HistoryModalProps {
  record: BlacklistRecord;
  onPreviewFile: (fileId: string, fileName: string) => void;
  onClose: () => void;
}

/** 두 번호가 같으면 한 번만 보여준다. 같은 값을 두 번 쓰면 읽기만 번잡하다. */
function formatPhones(tel1: string | null, tel2: string | null): string {
  const a = (tel1 ?? '').trim();
  const b = (tel2 ?? '').trim();
  if (!a && !b) return '-';
  if (!a) return b;
  if (!b || a === b) return a;
  return `${a} / ${b}`;
}

/**
 * 이 사람이 언제 무엇으로 신청했는지.
 *
 * 신청 한 건이 한 덩어리다 — 신청횟수가 3회면 여기도 세 덩어리여야 숫자와
 * 목록을 대조할 수 있다.
 *
 * 주문번호와 그 행에 적힌 이름을 같이 보여준다. 사람을 가리는 기준이 번호라서
 * 이름이 서로 다른 행이 한 사람으로 묶이는 일이 흔한데, 그 이름이 안 보이면
 * "왜 이 사람이 3회지?"를 되짚을 방법이 없다.
 */
const HistoryModal = memo(function HistoryModalComponent({
  record,
  onPreviewFile,
  onClose,
}: HistoryModalProps) {
  const files = record.source_files ?? [];

  return (
    <div className={styles.modal}>
      <div className={styles.reasonModalContent}>
        <div className={styles.reasonModalHeader}>
          <h2>신청 내역</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <div className={styles.infoLabel}>고객명</div>
            <div className={styles.infoValue}>{record.customer_name || '-'}</div>
          </div>
          <div className={styles.field}>
            <div className={styles.infoLabel}>생년월일</div>
            <div className={styles.infoValue}>{formatJuminForDisplay(record.birth)}</div>
          </div>
          <div className={styles.fieldLast}>
            <div className={styles.infoLabel}>전화번호</div>
            <div className={styles.infoValue}>{formatPhones(record.tel1, record.tel2)}</div>
          </div>

          <div className={styles.historySection}>
            <div className={styles.historyTitle}>신청 기록 ({files.length}건)</div>
            <div className={styles.historyList}>
              {files.map((file, idx) => (
                <div key={`${file.id ?? '-'}:${file.orderNo || idx}`} className={styles.historyItem}>
                  <div className={styles.historyRow}>
                    <span className={styles.historyLabel}>파일</span>
                    {file.id ? (
                      <button
                        type="button"
                        className={styles.historyFileBtn}
                        onClick={() => onPreviewFile(file.id!, file.name)}
                      >
                        {file.name}
                      </button>
                    ) : (
                      <span>{file.name}</span>
                    )}
                  </div>
                  <div className={styles.historyRow}>
                    <span className={styles.historyLabel}>주문번호</span>
                    <span>{file.orderNo || '-'}</span>
                  </div>
                  <div className={styles.historyRow}>
                    <span className={styles.historyLabel}>고객명</span>
                    <span>{file.customerName || '-'}</span>
                  </div>
                  <div className={styles.historyRow}>
                    <span className={styles.historyLabel}>상품</span>
                    <span className={styles.historyProduct} title={file.product ?? ''}>
                      {file.product || '-'}
                    </span>
                  </div>
                </div>
              ))}
              {files.length === 0 && (
                <div className={styles.historyEmpty}>신청 기록을 찾지 못했습니다.</div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button onClick={onClose} className={`${styles.registerModalBtn} ${styles.cancel}`}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
});

export default HistoryModal;
