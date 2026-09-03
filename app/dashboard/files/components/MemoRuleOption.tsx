'use client';

import { memo } from 'react';
import styles from '../page.module.css';

interface MemoRuleOptionProps {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}

/**
 * 상담메모 우선 배정 스위치.
 *
 * 파일을 고르기 전에도 보여야 한다. 분류를 누르는 순간의 값으로 배정이 갈리므로
 * 파일 목록에 묻어두면 켠 줄 모르고 돌리게 된다.
 *
 * ── 지금은 화면에 안 붙어 있다 ──────────────────────────────
 * 상담메모 규칙을 쓰지 않기로 해서 files/page.tsx에서 렌더를 뺐다.
 * 지운 게 아니라 세워 둔 것이다 — 규칙 자체(lib/insurance.ts의
 * isMemoBeforeCutoff·MEMO_RULE_GROUP)와 분류·배포의 memoRule 처리는
 * 그대로 살아 있고, 지금은 memoRule이 늘 false로 넘어갈 뿐이다.
 *
 * 되살리려면 files/page.tsx에서
 *   1) 이 컴포넌트를 import하고
 *   2) memoRule을 useState(false) → useState(true) 또는 setter를 되살린 뒤
 *   3) <MemoRuleOption checked={memoRule} disabled={...} onChange={setMemoRule} />
 * 를 다시 넣으면 된다.
 * ──────────────────────────────────────────────────────────
 */
const MemoRuleOption = memo(function MemoRuleOptionComponent({
  checked,
  disabled,
  onChange,
}: MemoRuleOptionProps) {
  return (
    <label className={styles.memoRuleOption}>
      <input
        type="checkbox"
        className={styles.memoRuleCheckbox}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className={styles.memoRuleText}>
        <span className={styles.memoRuleLabel}>상담메모 우선 배정</span>
        <span className={styles.memoRuleHint}>
          상담 예정이 오늘 11시 이전이면 파라인슈로 배정합니다.
        </span>
      </span>
    </label>
  );
});

export default MemoRuleOption;
