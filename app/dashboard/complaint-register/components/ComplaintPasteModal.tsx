'use client';

import React, { memo, useMemo, useState } from 'react';
import { MdClose, MdContentPaste } from 'react-icons/md';
import { parseComplaintPaste, PASTE_HEADERS } from '@/lib/complaintPaste';
import type { ComplaintInput, BulkRegisterResult } from '@/app/hooks/useComplaints';
import { useAlert } from '@/app/components/Alert/Alert';
import styles from '../page.module.css';

/**
 * 메일 표를 붙여넣어 여러 건을 한 번에 접수하는 창.
 *
 * 붙여넣는 즉시 무엇이 어떻게 읽혔는지 표로 보여준다 — 넣고 나서 틀린 것을
 * 발견하면 지우고 다시 넣어야 하는데, 그때는 이미 지사에 전달된 뒤다.
 */

interface ComplaintPasteModalProps {
  onClose: () => void;
  onSubmit: (rows: ComplaintInput[]) => Promise<BulkRegisterResult | undefined>;
  isSubmitting: boolean;
}

const ComplaintPasteModal = memo(function ComplaintPasteModalComponent({
  onClose,
  onSubmit,
  isSubmitting,
}: ComplaintPasteModalProps) {
  const { showAlert } = useAlert();
  const [text, setText] = useState('');

  // 붙여넣는 대로 다시 읽는다. 글자가 많아도 계산이 가벼워 그때그때 해도 된다.
  const parsed = useMemo(() => parseComplaintPaste(text), [text]);
  const problemAt = useMemo(
    () => new Map(parsed.problems.map((p) => [p.at, p.reason])),
    [parsed.problems]
  );
  const okCount = parsed.rows.length - parsed.problems.length;

  const handleSubmit = async () => {
    // 문제가 있는 줄은 빼고 나머지만 보낸다. 고칠 줄은 사람이 메일에서 다시 본다.
    const rows = parsed.rows.filter((_, at) => !problemAt.has(at + 1));
    const done = await onSubmit(rows);
    if (!done) return;
    /*
     * 결과는 우리 알림창으로 낸다. 창 안에 결과 화면을 따로 그리면 같은 일에
     * 두 가지 모양이 생긴다 — 다른 화면은 전부 이 창으로 말한다.
     */
    const bad = done.results.filter((r) => !r.ok);
    showAlert({
      type: bad.length > 0 ? 'warning' : 'success',
      title: '붙여넣기 등록',
      message: (
        <>
          <p>
            {done.created}건이 등록되었습니다.
            {done.failed > 0 && ` (${done.failed}건 실패)`}
          </p>
          {bad.map((r) => (
            <p key={r.at}>
              {r.at + 1}번째 줄 — {r.error}
            </p>
          ))}
        </>
      ),
    });
    onClose();
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

            <p className={styles.pasteGuide}>
              메일의 표를 그대로 붙여넣으세요. 머리글이 있어도 됩니다.
              <span className={styles.pasteHeaders}>{PASTE_HEADERS.join(' · ')}</span>
            </p>

            <textarea
              className={styles.pasteArea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={`흥국화재(든든한3N5)_상담예약(보관에어프라이어)\t이덕임\t010-4753-8173\t2026-07-08\t2026-07-09\t사은품 배송일정 확인후 연락요청\t20667021\t2026-08-31 16:04`}
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
                      <th>수령인</th>
                      <th>전화번호</th>
                      <th>주문번호</th>
                      <th>고객 접수일</th>
                      <th>통화일시</th>
                      <th>확인</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.map((row, at) => {
                      const problem = problemAt.get(at + 1);
                      return (
                        <tr key={at} className={problem ? styles.pasteBadRow : ''}>
                          <td>{at + 1}</td>
                          <td>{row.customerName || '-'}</td>
                          <td>{row.phone || '-'}</td>
                          <td>{row.orderNo || '-'}</td>
                          <td>{row.receivedAt || '-'}</td>
                          <td>{row.calledAt ? row.calledAt.replace('T', ' ') : '-'}</td>
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
      </div>
    </div>
  );
});

export default ComplaintPasteModal;
