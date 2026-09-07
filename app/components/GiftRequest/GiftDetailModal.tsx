'use client';

import React, { memo } from 'react';
import { MdClose } from 'react-icons/md';
import { GIFT_STATUS_LABEL, type GiftRequestRow } from '@/lib/gifts';
import styles from './GiftRequest.module.css';

/**
 * 사은품 신청 한 건의 모든 것.
 *
 * 목록에는 훑는 데 필요한 것만 두고, 발주리스트 열 열여덟 개는 전부 여기서 본다.
 * 순서는 엑셀 열 순서 그대로다 — 사은품담당자가 그 엑셀에 옮겨 적는다.
 */

const dateText = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('ko-KR').slice(0, -1) : '-';

const dateTimeText = (value: string | null) => {
  if (!value) return '-';
  const at = new Date(value);
  return `${at.toLocaleDateString('ko-KR').slice(0, -1)} ${at.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const Line = ({ label, children }: { label: string; children?: React.ReactNode }) => (
  <div>
    <dt>{label}</dt>
    <dd>{children || '-'}</dd>
  </div>
);

interface GiftDetailModalProps {
  row: GiftRequestRow;
  onClose: () => void;
}

const GiftDetailModal = memo(function GiftDetailModalComponent({ row, onClose }: GiftDetailModalProps) {
  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modal} ${styles.detailModal}`}>
        <div className={styles.modalHeader}>
          <h3>
            {row.customer_name}
            <span className={`${styles.statusBadge} ${styles[`status_${row.status}`]}`}>
              {GIFT_STATUS_LABEL[row.status]}
            </span>
          </h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            <MdClose />
          </button>
        </div>

        {row.status === 'supplement' && row.supplement_reason && (
          <div className={styles.threadBox}>
            <h4>보완 요청 사유</h4>
            <p className={styles.threadMemo}>{row.supplement_reason}</p>
            <span className={styles.threadWhen}>
              {row.supplement_by} · {dateTimeText(row.supplement_at)}
            </span>
          </div>
        )}

        <h4 className={styles.detailTitle}>배송</h4>
        <dl className={styles.detailList}>
          <Line label="발주일">{dateText(row.order_date)}</Line>
          <Line label="택배사">{row.courier}</Line>
          <Line label="운송장번호">{row.tracking_no}</Line>
        </dl>

        <h4 className={styles.detailTitle}>고객</h4>
        <dl className={styles.detailList}>
          <Line label="고객명">{row.customer_name}</Line>
          <Line label="전화번호1">{row.phone1}</Line>
          <Line label="전화번호2">{row.phone2}</Line>
          <Line label="우편번호">{row.zip}</Line>
          <Line label="주소">{row.address}</Line>
          <Line label="배송메세지">{row.delivery_memo}</Line>
        </dl>

        <h4 className={styles.detailTitle}>사은품</h4>
        <dl className={styles.detailList}>
          <Line label="사은품명">{row.gift_name}</Line>
          <Line label="수량">{row.quantity}</Line>
          <Line label="비고">{row.note}</Line>
          <Line label="보내시는분">{row.sender_name}</Line>
          <Line label="보내시는분 연락처">{row.sender_phone}</Line>
          <Line label="상품명(방송사)">{row.product}</Line>
          <Line label="고객번호">{row.customer_no}</Line>
          <Line label="상담원">{row.counselor}</Line>
          <Line label="정산구분">{row.settlement}</Line>
        </dl>

        <h4 className={styles.detailTitle}>진행</h4>
        <dl className={styles.detailList}>
          <Line label="주문번호">{row.order_no}</Line>
          <Line label="근거 파일">{row.source_file_name}</Line>
          <Line label="신청한 사람">{row.requester_name}</Line>
          <Line label="소속 지사">{row.group_name}</Line>
          <Line label="신청 시각">{dateTimeText(row.created_at)}</Line>
          {row.forwarded_at && (
            <Line label="지사 전달">
              {dateTimeText(row.forwarded_at)} · {row.forwarded_by}
            </Line>
          )}
          {row.shipped_at && (
            <Line label="발주">
              {dateTimeText(row.shipped_at)} · {row.shipped_by}
            </Line>
          )}
        </dl>

        <div className={styles.modalActions}>
          <button type="button" className={styles.actionBtn} onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
});

export default GiftDetailModal;
