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
