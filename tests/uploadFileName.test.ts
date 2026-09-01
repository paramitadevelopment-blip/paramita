import { describe, it, expect } from 'vitest';
import { isValidUploadFileName } from '@/lib/insurance';

/**
 * 업로드 파일명 규칙.
 * 화면과 서버가 같은 함수를 써야 한다 — 서버가 느슨하면 화면이 거부한 파일이
 * API로 들어와, 보험사를 못 가려 배포에서 막힐 파일이 이미 저장된 뒤가 된다.
 */
describe('업로드 파일명', () => {
  it('날짜 + 보험사명이면 통과한다', () => {
    expect(isValidUploadFileName('20260815_동양생명.xlsx')).toBe(true);
    expect(isValidUploadFileName('20260815 동양생명.xlsx')).toBe(true);
    expect(isValidUploadFileName('20260815동양생명.xlsx')).toBe(true);
    expect(isValidUploadFileName('20260815_흥국화재.xlsx')).toBe(true);
    expect(isValidUploadFileName('20260815_한화생명.xlsx')).toBe(true);
  });

  it('보험사명이 없으면 막는다', () => {
    // 예전에는 서버가 숫자 8자리만 봐서 이런 파일이 통과했다.
    expect(isValidUploadFileName('20260101_아무회사.xlsx')).toBe(false);
    expect(isValidUploadFileName('20260101.xlsx')).toBe(false);
  });

  it('날짜가 없으면 막는다', () => {
    expect(isValidUploadFileName('동양생명.xlsx')).toBe(false);
    expect(isValidUploadFileName('2026_동양생명.xlsx')).toBe(false);
  });

  it('빈 값·null도 막는다', () => {
    expect(isValidUploadFileName('')).toBe(false);
    expect(isValidUploadFileName(null)).toBe(false);
    expect(isValidUploadFileName(undefined)).toBe(false);
  });
});
