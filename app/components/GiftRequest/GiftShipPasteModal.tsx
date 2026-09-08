'use client';

import React, { memo, useMemo, useState } from 'react';
import { MdClose, MdLocalShipping } from 'react-icons/md';
import {
  parseShipPaste,
  GIFT_PASTE_HEADERS,
  type ShipPasteRow,
} from '@/lib/giftPaste';
import type { ShipPasteResultData } from '@/app/hooks/useGifts';
import styles from './GiftRequest.module.css';

/**
 * 발주처가 채워 돌려준 표를 붙여넣어 배송 정보를 한 번에 채운다.
 *
 * 보낸 발주리스트가 **발주일·택배사·운송장번호**가 채워져 돌아온다. 열두 건이면
 * 열두 번 창을 열어 옮겨 적던 일이라, 표를 통째로 받아 읽는다.
 *
 * 붙여넣는 즉시 무엇이 어떻게 읽혔는지 표로 보여준다. 고객번호가 우리 신청과
 * 맞는 줄만 채워지고, 안 맞는 줄(다른 회사 건)은 조용히 건너뛴다 — 그건 오류가
 * 아니다. 실제로 몇 줄이 우리 것인지는 서버가 찾아 봐야 알므로, 결과에서 알려준다.
 */
interface GiftShipPasteModalProps {
  onClose: () => void;
  onSubmit: (rows: ShipPasteRow[]) => Promise<ShipPasteResultData | undefined>;
  isSubmitting: boolean;
}

const GiftShipPasteModal = memo(function GiftShipPasteModalComponent({
  onClose,
  onSubmit,
  isSubmitting,
}: GiftShipPasteModalProps) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ShipPasteResultData | null>(null);

  // 붙여넣는 대로 다시 읽는다. 글자가 많아도 계산이 가벼워 그때그때 해도 된다.
  const parsed = useMemo(() => parseShipPaste(text), [text]);

  const handleSubmit = async () => {
    const done = await onSubmit(parsed.rows);
    if (done) setResult(done);
  };

  return (
    /* 배경을 눌러도 닫히지 않는다 — 붙여넣은 것이 통째로 날아가면 안 된다. */
    <div className={styles.modalOverlay}>
      <div className={`${styles.modal} ${styles.pasteModal}`}>
        <div className={styles.modalHeader}>
          <h3>배송 정보 붙여넣기</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            <MdClose />
          </button>
        </div>

        {result ? (
          <div className={styles.pasteDone}>
            <p className={styles.resultOk}>{result.filled}건에 배송 정보를 채웠습니다.</p>
            {result.skipped > 0 && (
              <p className={styles.pasteCheck}>
                {result.skipped}건은 우리 신청이 아니거나 채울 것이 없어 건너뛰었습니다.
              </p>
            )}
            {result.failed > 0 && (
              <p className={styles.pasteProblem}>{result.failed}건은 저장하지 못했습니다.</p>
            )}

            {/*
              발주는 나갔는데 송장이 안 들어온 건. 채운 것만 세면 "열네 건 보냈는데
              열두 건만 왔다"를 아무도 모른다 — 발주처에 다시 물어야 할 줄이다.
            */}
            {result.remaining.length > 0 ? (
              <div className={styles.threadBox}>
                <h4>아직 송장이 안 들어온 건 {result.remaining.length}건</h4>
                <ul className={styles.priorList}>
                  {result.remaining.map((r) => (
                    <li key={r.id}>
                      발주 #{r.order_id} · {r.customer_name} · {r.gift_name} × {r.quantity}
                      <span className={styles.priorAddress}>
                        {r.group_name} · 주문번호 {r.order_no}
                      </span>
                    </li>
                  ))}
                </ul>
                <span className={styles.fieldHint}>
                  이 건들은 발주처에 다시 물어 주세요. 받은 뒤 다시 붙여넣으면 채워집니다.
                </span>
              </div>
            ) : (
              result.filled > 0 && (
                <p className={styles.resultOk}>이번에 손댄 발주 장은 모두 송장이 들어왔습니다.</p>
              )
            )}

            <p className={styles.fieldHint}>
              채운 건은 &apos;배송 정보 입력됨&apos;이 되고, 신청한 지사에 확인 요청으로 뜹니다.
            </p>
            <div className={styles.formActions}>
              <button type="button" className={styles.submitBtn} onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.pasteGuide}>
              발주처가 채워 준 표를 그대로 붙여넣으세요. 머리글이 있어도 되고, 다른 회사 건이
              섞여 있어도 됩니다 — <b>고객번호가 우리 신청과 맞는 줄만</b> 채워집니다.
              <span className={styles.pasteHeaders}>{GIFT_PASTE_HEADERS.join(' · ')}</span>
            </p>

            <textarea
              className={styles.pasteArea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={`2026-09-08\tCJ대한통운\t1234-5678-9012\t박헌정\t010-9700-9461\t…\t67309060\t김설계\t정산해당`}
            />

            {text.trim().length > 0 && (
              <div className={styles.pasteSummary}>
                <b>{parsed.rows.length}줄</b>에서 배송 정보를 읽었습니다
                {parsed.skipped > 0 && ` · 채울 것이 없어 버린 줄 ${parsed.skipped}개`}
              </div>
            )}

            {parsed.rows.length > 0 && (
              <div className={styles.pastePreview}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>고객번호</th>
                      <th>고객명</th>
                      <th>사은품</th>
                      <th>발주일</th>
                      <th>택배사</th>
                      <th>운송장번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, at) => (
                      <tr key={at}>
                        <td>{at + 1}</td>
                        <td>{row.orderNo}</td>
                        <td>{row.customerName || '-'}</td>
                        <td>{row.giftName || '-'}</td>
                        {/* 날짜를 못 읽었으면 안 건드린다 — 그 자리를 비워 둔 채 알려준다. */}
                        <td>{row.orderDate || <span className={styles.muted}>안 바꿈</span>}</td>
                        <td>{row.courier || '-'}</td>
                        <td>{row.trackingNo || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className={styles.formActions}>
              <button type="button" className={styles.ghostBtn} onClick={onClose}>
                취소
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={parsed.rows.length === 0 || isSubmitting}
              >
                <MdLocalShipping />
                {isSubmitting ? '채우는 중…' : `${parsed.rows.length}줄 채우기`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default GiftShipPasteModal;
