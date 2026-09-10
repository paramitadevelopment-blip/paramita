'use client';

import React, { memo, useMemo, useState } from 'react';
import { MdClose, MdContentPaste } from 'react-icons/md';
import { parseGiftPaste, GIFT_PASTE_HEADERS, type GiftPasteRow } from '@/lib/giftPaste';
import type { BulkGiftResult } from '@/app/hooks/useGifts';
import { useAlert } from '@/app/components/Alert/Alert';
import styles from './GiftRequest.module.css';

/**
 * 발주리스트 양식 표를 붙여넣어 여러 건을 한 번에 넣는 창.
 *
 * 붙여넣는 즉시 무엇이 어떻게 읽혔는지 표로 보여준다 — 넣고 나서 틀린 것을
 * 발견하면 지우고 다시 넣어야 한다.
 *
 * 붙여넣은 이름은 기록과 대조한다 — 고객번호 한 자리가 틀려 남의 기록에
 * 붙는 것을 여기서 거른다.
 *
 * 이미 신청된 주문번호가 섞여 있으면 그 줄만 남겨 사유 칸을 연다. 한 주문번호로
 * 여러 상품을 보내는 일이 잦아서, 한 건 창으로 옮겨 적게 하면 그게 곧 일이다.
 * 사유를 적은 줄은 관리자 확인 대기로 들어간다.
 */

interface GiftPasteModalProps {
  onClose: () => void;
  onSubmit: (rows: GiftPasteRow[]) => Promise<BulkGiftResult | undefined>;
  isSubmitting: boolean;
}

/** 붙여넣은 표의 줄 번호(사람이 보는 번호)를 붙인 줄. 실패를 알릴 때 그 번호로 말한다. */
type Sent = { at: number; row: GiftPasteRow };
type Failure = { at: number; error: string };

const GiftPasteModal = memo(function GiftPasteModalComponent({
  onClose,
  onSubmit,
  isSubmitting,
}: GiftPasteModalProps) {
  const { showAlert } = useAlert();
  const [text, setText] = useState('');
  // 첫 등록에서 이미 신청된 주문번호로 돌아온 줄. 비어 있지 않으면 사유 단계다.
  const [asking, setAsking] = useState<Sent[]>([]);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  // 첫 등록의 결과. 사유 단계가 끝나면 둘을 합쳐 한 번에 알린다.
  const [first, setFirst] = useState<{ created: number; failures: Failure[] }>({ created: 0, failures: [] });

  // 붙여넣는 대로 다시 읽는다. 글자가 많아도 계산이 가벼워 그때그때 해도 된다.
  const parsed = useMemo(() => parseGiftPaste(text), [text]);
  const problemAt = useMemo(
    () => new Map(parsed.problems.map((p) => [p.at, p.reason])),
    [parsed.problems],
  );
  const okCount = parsed.rows.length - parsed.problems.length;

  const report = (created: number, failures: Failure[]) => {
    /*
     * 결과는 우리 알림창으로 낸다. 창 안에 결과 화면을 따로 그리면 같은 일에
     * 두 가지 모양이 생긴다 — 다른 화면은 전부 이 창으로 말한다.
     */
    showAlert({
      type: failures.length > 0 ? 'warning' : 'success',
      title: '붙여넣기 등록',
      message: (
        <>
          <p>
            {created}건이 등록되었습니다.
            {failures.length > 0 && ` (${failures.length}건 실패)`}
          </p>
          {failures.map((f) => (
            <p key={f.at}>
              {f.at}번째 줄 — {f.error}
            </p>
          ))}
        </>
      ),
    });
    onClose();
  };

  const handleSubmit = async () => {
    // 문제가 있는 줄은 빼고 나머지만 보낸다. 고칠 줄은 사람이 표에서 다시 본다.
    const sent: Sent[] = parsed.rows
      .map((row, i) => ({ at: i + 1, row }))
      .filter((s) => !problemAt.has(s.at));
    const done = await onSubmit(sent.map((s) => s.row));
    if (!done) return;
    const dup = done.results.filter((r) => !r.ok && r.code === 'duplicate');
    const failures = done.results
      .filter((r) => !r.ok && r.code !== 'duplicate')
      .map((r) => ({ at: sent[r.at].at, error: r.error ?? '' }));
    if (dup.length === 0) {
      report(done.created, failures);
      return;
    }
    setFirst({ created: done.created, failures });
    setAsking(dup.map((r) => sent[r.at]));
  };

  // 사유는 줄마다 다 있어야 한다. 왜 여러 건인지가 이 흐름의 전부다.
  const allFilled = asking.length > 0 && asking.every((s) => reasons[s.at]?.trim());

  const handleSubmitReasons = async () => {
    const done = await onSubmit(asking.map((s) => ({ ...s.row, checkReason: reasons[s.at].trim() })));
    if (!done) return;
    const failures = [
      ...first.failures,
      ...done.results.filter((r) => !r.ok).map((r) => ({ at: asking[r.at].at, error: r.error ?? '' })),
    ].sort((a, b) => a.at - b.at);
    report(first.created + done.created, failures);
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

        {asking.length > 0 ? (
          <>
            <p className={styles.pasteGuide}>
              {first.created > 0 && `${first.created}건을 등록했습니다. `}
              아래 {asking.length}건은 이미 신청된 주문번호입니다.
            </p>

            <div className={styles.pastePreview}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>고객명</th>
                    <th>고객번호</th>
                    <th>사은품</th>
                    <th>수량</th>
                    <th>사유</th>
                  </tr>
                </thead>
                <tbody>
                  {asking.map(({ at, row }) => (
                    <tr key={at}>
                      <td>{at}</td>
                      <td>{row.pastedName || '-'}</td>
                      <td>{row.orderNo || '-'}</td>
                      <td>{row.giftName || '-'}</td>
                      <td>{row.quantity}</td>
                      <td>
                        <input
                          type="text"
                          className={styles.pasteReason}
                          value={reasons[at] ?? ''}
                          onChange={(e) => setReasons((prev) => ({ ...prev, [at]: e.target.value }))}
                          maxLength={500}
                          placeholder="예: 두 번째 상품 가입분 / 고객이 추가로 요청"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => report(first.created, first.failures)}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={handleSubmitReasons}
                disabled={!allFilled || isSubmitting}
                title={allFilled ? undefined : '줄마다 사유를 적어 주세요'}
              >
                <MdContentPaste />
                {isSubmitting ? '등록 중…' : `${asking.length}건 등록`}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.pasteGuide}>
              발주리스트 양식을 붙여넣어 주세요.
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
                {parsed.skipped > 0 && ` · 항목이 부족해 제외된 줄 ${parsed.skipped}개`}
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
