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
  // 서버가 순서를 보장하지 않는다. 오래된 것부터 세워야 '1차·2차'가 맞는다.
  const supplements = [...(row.gift_supplements ?? [])].sort((a, b) =>
    a.returned_at.localeCompare(b.returned_at)
  );

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

        {(row.status === 'supplement' || row.status === 'withdrawn') && row.supplement_reason && (
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
          {/* 어느 발주리스트에 실렸나. 발주일은 그 묶음을 만든 날이다. */}
          <Line label="발주 묶음">{row.order_id ? `#${row.order_id}` : null}</Line>
          <Line label="발주일">{dateText(row.order_date)}</Line>
          <Line label="택배사">{row.courier}</Line>
          <Line label="운송장번호">{row.tracking_no}</Line>
          {/*
            배송메세지는 택배 기사에게 가는 말이라 배송 쪽에 둔다. 지사가 신청할 때
            적기도 하고, 담당자가 송장을 넣으며 함께 적기도 한다 — 그 둘이 한자리에
            있어야 "무엇이 어떻게 나갔나"가 한눈에 읽힌다.
          */}
          <Line label="배송메세지">{row.delivery_memo}</Line>
          {row.shipped_at && (
            <Line label="배송 정보 입력">
              {dateTimeText(row.shipped_at)} · {row.shipped_by}
            </Line>
          )}
        </dl>

        <h4 className={styles.detailTitle}>고객</h4>
        <dl className={styles.detailList}>
          <Line label="고객명">{row.customer_name}</Line>
          <Line label="전화번호1">{row.phone1}</Line>
          <Line label="전화번호2">{row.phone2}</Line>
          <Line label="우편번호">{row.zip}</Line>
          <Line label="주소">{row.address}</Line>
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
          {/* 같은 주문번호의 재신청. 왜 또 보냈고 누가 통과시켰는지가 여기 남는다. */}
          {row.check_reason && (
            <>
              <Line label="신청 사유">{row.check_reason}</Line>
              <Line label="관리자 확인">
                {row.checked_at ? (
                  `${dateTimeText(row.checked_at)} · ${row.checked_by}`
                ) : (
                  <span className={styles.muted}>아직 확인 전 — 담당자에게 가지 않습니다</span>
                )}
              </Line>
            </>
          )}
          <Line label="신청한 사람">{row.requester_name}</Line>
          <Line label="소속 지사">{row.group_name}</Line>
          <Line label="신청 시각">{dateTimeText(row.created_at)}</Line>
          {row.forwarded_at && (
            <Line label="지사 전달">
              {dateTimeText(row.forwarded_at)} · {row.forwarded_by}
            </Line>
          )}
          {/*
            담당자가 봤는가. 지사는 이걸로 "아직 고칠 수 있나"를 안다 —
            확인 전이면 고칠 수 있고, 확인된 순간 닫힌다.
          */}
          {row.forwarded_at && (
            <Line label="담당자 확인">
              {row.read_at ? (
                `${dateTimeText(row.read_at)} · ${row.read_by}`
              ) : (
                <span className={styles.muted}>아직 확인 전 — 지사가 고칠 수 있습니다</span>
              )}
            </Line>
          )}
          {/* 송장을 신청한 쪽이 봤는가. 안 봤으면 지사의 할 일로 배지에 잡혀 있다. */}
          {row.status === 'shipped' && (
            <Line label="지사 확인">
              {row.ship_read_at ? (
                `${dateTimeText(row.ship_read_at)} · ${row.ship_read_by}`
              ) : (
                <span className={styles.muted}>아직 확인 전</span>
              )}
            </Line>
          )}
          {/* 철회. 지운 게 아니라 닫은 것이라, 누가 언제 왜 닫았는지가 남는다. */}
          {row.status === 'withdrawn' && (
            <>
              <Line label="철회">
                {dateTimeText(row.withdrawn_at)} · {row.withdrawn_by}
              </Line>
              <Line label="철회 사유">{row.withdraw_reason || '적지 않음'}</Line>
            </>
          )}
        </dl>

        {/*
          보완 이력. 고쳐서 다시 올리면 위의 상태는 바뀌지만 여기 기록은 남는다 —
          몇 번 오갔고 그때마다 무엇이 문제였는지가 그 건의 사정이다.
        */}
        {supplements.length > 0 && (
          <>
            <h4 className={styles.detailTitle}>보완 이력 ({supplements.length}회)</h4>
            <dl className={styles.detailList}>
              {supplements.map((r, at) => (
                <Line key={`${r.returned_at}-${at}`} label={`${at + 1}차 보완`}>
                  <span className={styles.detailNote}>{r.reason}</span>
                  <span className={styles.returnMeta}>
                    {r.returned_by} · {dateTimeText(r.returned_at)}
                  </span>
                </Line>
              ))}
            </dl>
          </>
        )}

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
