'use client';

import React, { memo, useRef } from 'react';
import { digitsOnly } from '@/lib/columnAliases';
import styles from '../page.module.css';

export interface RegisterForm {
  customerName: string;
  birthDate: string;
  birthGender: string;
  tel1: string;
  tel2: string;
  reason: string;
}

interface RegisterModalProps {
  form: RegisterForm;
  onChange: (form: RegisterForm) => void;
  onSubmit: () => void;
  onClose: () => void;
  isSubmitting: boolean;
}

/**
 * 전화번호에 하이픈을 넣어 준다.
 *
 * 사람이 직접 치는 값이라 010-1234-5678, 01012345678, 010 1234 5678이 섞인다.
 * 서버가 어차피 하이픈을 벗겨 저장하지만, 화면에서 자릿수가 눈에 보여야
 * 한 자리 빠뜨린 걸 알아챈다.
 */
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

/**
 * 관리자가 손으로 명단에 올리는 창.
 *
 * 상품은 받지 않는다 — 손으로 올린 건 "이 번호는 어느 상품으로 와도 막아라"는
 * 뜻이고, 상품명을 사람이 치면 파일에 적힌 것과 한 글자만 달라도 안 걸린다.
 */
const RegisterModal = memo(function RegisterModalComponent({
  form,
  onChange,
  onSubmit,
  onClose,
  isSubmitting,
}: RegisterModalProps) {
  // 앞 여섯 자리를 다 채우면 성별 칸으로 넘겨준다. 손이 한 번 덜 간다.
  const genderRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<RegisterForm>) => onChange({ ...form, ...patch });

  return (
    <div className={styles.modal}>
      <div className={`${styles.reasonModalContent} ${styles.registerModalContent}`}>
        <div className={styles.reasonModalHeader}>
          <h2>블랙리스트 직접 등록</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              고객명 <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              value={form.customerName}
              onChange={(e) => set({ customerName: e.target.value })}
              placeholder="고객명을 입력하세요"
              maxLength={50}
              className={styles.registerInput}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              주민등록번호 <span className={styles.required}>*</span>
            </label>
            <div className={styles.juminRow}>
              <div className={styles.juminDate}>
                <input
                  type="text"
                  value={form.birthDate}
                  onChange={(e) => {
                    // 하이픈이 한 글자만 섞여도 여섯 자리 안에서 진짜 숫자가
                    // 밀려 잘리고, 그러면 성별 코드가 저장될 때 사라진다.
                    const val = digitsOnly(e.target.value, 6);
                    set({ birthDate: val });
                    if (val.length === 6) genderRef.current?.focus();
                  }}
                  placeholder="YYMMDD"
                  maxLength={6}
                  // 숫자 자판으로 띄운다. type="number"는 스피너가 붙고
                  // 앞자리 0이 날아가서 생년월일에는 못 쓴다.
                  inputMode="numeric"
                  autoComplete="off"
                  className={styles.registerInput}
                />
              </div>
              <span className={styles.juminSep}>-</span>
              <div className={styles.juminGender}>
                <input
                  ref={genderRef}
                  type="text"
                  value={form.birthGender}
                  onChange={(e) => set({ birthGender: digitsOnly(e.target.value, 1) })}
                  placeholder="1"
                  maxLength={1}
                  inputMode="numeric"
                  autoComplete="off"
                  className={styles.registerInput}
                />
              </div>
              <span className={styles.juminMask}>******</span>
            </div>
          </div>

          <div className={styles.telGrid}>
            <div>
              <label className={styles.fieldLabel}>
                전화번호1 <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                value={form.tel1}
                onChange={(e) => set({ tel1: formatPhone(e.target.value) })}
                placeholder="010-0000-0000"
                maxLength={13}
                inputMode="numeric"
                autoComplete="off"
                className={styles.registerInput}
              />
            </div>
            <div>
              <label className={styles.fieldLabel}>전화번호2</label>
              <input
                type="text"
                value={form.tel2}
                onChange={(e) => set({ tel2: formatPhone(e.target.value) })}
                placeholder="010-0000-0000"
                maxLength={13}
                inputMode="numeric"
                autoComplete="off"
                className={styles.registerInput}
              />
            </div>
          </div>

          <div className={styles.fieldLast}>
            <label className={styles.fieldLabel}>
              등록 사유 <span className={styles.required}>*</span>
            </label>
            <textarea
              value={form.reason}
              onChange={(e) => set({ reason: e.target.value })}
              placeholder="등록 사유를 입력하세요"
              maxLength={500}
              className={styles.registerTextarea}
            />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button onClick={onClose} className={`${styles.registerModalBtn} ${styles.cancel}`}>
            취소
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className={`${styles.registerModalBtn} ${styles.submit}`}
          >
            {isSubmitting ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
});

export default RegisterModal;
