'use client';

import React, { memo, useMemo, useState } from 'react';
import { MdClose, MdContentPaste, MdExpandMore } from 'react-icons/md';
import { parseGiftPaste, GIFT_PASTE_HEADERS, type GiftPasteRow } from '@/lib/giftPaste';
import type { BulkGiftResult } from '@/app/hooks/useGifts';
import styles from './GiftRequest.module.css';

/**
 * 발주리스트 양식 표를 붙여넣어 여러 건을 한 번에 넣는 창.
 *
 * 붙여넣는 즉시 무엇이 어떻게 읽혔는지 표로 보여준다 — 넣고 나서 틀린 것을
 * 발견하면 지우고 다시 넣어야 한다.
 *
 * 고객명·전화번호는 붙여넣은 값이 아니라 배포 기록의 값이 저장된다. 붙여넣은
 * 이름은 기록과 대조하는 데만 쓴다 — 고객번호 한 자리가 틀려 남의 기록에
 * 붙는 것을 여기서 거른다.
 */

interface GiftPasteModalProps {
  onClose: () => void;
  onSubmit: (rows: GiftPasteRow[]) => Promise<BulkGiftResult | undefined>;
  isSubmitting: boolean;
}

const GiftPasteModal = memo(function GiftPasteModalComponent({
  onClose,
  onSubmit,
  isSubmitting,
}: GiftPasteModalProps) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<BulkGiftResult | null>(null);

  // 붙여넣는 대로 다시 읽는다. 글자가 많아도 계산이 가벼워 그때그때 해도 된다.
  const parsed = useMemo(() => parseGiftPaste(text), [text]);
  const problemAt = useMemo(
    () => new Map(parsed.problems.map((p) => [p.at, p.reason])),
    [parsed.problems],
  );
  const okCount = parsed.rows.length - parsed.problems.length;

  const handleSubmit = async () => {
    // 문제가 있는 줄은 빼고 나머지만 보낸다. 고칠 줄은 사람이 표에서 다시 본다.
    const rows = parsed.rows.filter((_, at) => !problemAt.has(at + 1));
    const done = await onSubmit(rows);
    if (done) setResult(done);
  };

  return (
    /* 배경을 눌러도 닫히지 않는다 — 붙여넣은 것이 통째로 날아가면 안 된다. */
    <div className={styles.modalOverlay}>
      <div className={`${styles.modal} ${styles.pasteModal}`}>
        <div className={styles.modalHeader}>
          <h3>붙여넣기로 등록</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="닫기">
            <MdClose />
          </button>
        </div>

        {result ? (
          <div className={styles.pasteDone}>
            <p className={styles.resultOk}>
              {result.created}건이 등록되었습니다.
              {result.failed > 0 && ` (${result.failed}건 실패)`}
            </p>
            {result.results
              .filter((r) => !r.ok)
              .map((r) => (
                <p key={r.at} className={styles.pasteProblem}>
                  {r.at + 1}번째 줄 — {r.error}
                </p>
              ))}
            <div className={styles.formActions}>
              <button type="button" className={styles.submitBtn} onClick={onClose}>
                닫기
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className={styles.pasteGuide}>
              발주리스트 양식의 표를 그대로 붙여넣으세요. 머리글이 있어도 되고,
              발주일·택배사·운송장번호는 비워 둡니다. 고객명·전화번호는 배포 기록의 값으로
              저장됩니다. 고객번호가 없거나 기록에 없는 줄, 이미 신청된 주문번호는 그 줄만 실패로 알려 줍니다.
              <span className={styles.pasteHeaders}>{GIFT_PASTE_HEADERS.join(' · ')}</span>
            </p>

            <textarea
              className={styles.pasteArea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={`\t\t\t이경덕\t010-4188-3979\t\t\t부산광역시 사하구 승학로 221\t\t보관에어프라이어\t1\t\t한울부원지사\t010-3408-5120\t흥국화재(든든한3N5)_상담예약(보관에어프라이어)\t20647967\t이승희\t정산해당`}
            />

            {text.trim().length > 0 && (
              <div className={styles.pasteSummary}>
                <b>{parsed.rows.length}건</b>을 읽었습니다
                {okCount !== parsed.rows.length && ` · 등록 가능 ${okCount}건`}
                {parsed.skipped > 0 && ` · 칸이 모자라 버린 것 ${parsed.skipped}개`}
              </div>
            )}

            {parsed.rows.length > 0 && (
              <div className={styles.pastePreview}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>고객명</th>
                      <th>전화번호1</th>
                      <th>고객번호</th>
                      <th>사은품</th>
                      <th>수량</th>
                      <th>상담원</th>
                      <th>확인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, at) => {
                      const problem = problemAt.get(at + 1);
                      return (
                        <tr key={at} className={problem ? styles.pasteBadRow : ''}>
                          <td>{at + 1}</td>
                          <td>{row.pastedName || '-'}</td>
                          <td>{row.pastedPhone || '-'}</td>
                          <td>{row.orderNo || '-'}</td>
                          <td>{row.giftName || '-'}</td>
                          <td>{row.quantity}</td>
                          <td>{row.counselor || '-'}</td>
                          <td className={styles.noteCell}>
                            {problem ? (
                              <span className={styles.pasteProblem}>{problem}</span>
                            ) : (
                              <span className={styles.pasteOk}>등록 가능</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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
                disabled={okCount === 0 || isSubmitting}
              >
                <MdContentPaste />
                {isSubmitting ? '등록 중…' : `${okCount}건 등록`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default GiftPasteModal;
