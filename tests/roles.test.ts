import { describe, it, expect } from 'vitest';
import { canUploadFiles, isAdminRole } from '@/lib/roles';

describe('관리자 계열 역할 (isAdminRole)', () => {
  it('관리자는 관리자다', () => {
    expect(isAdminRole('admin')).toBe(true);
  });

  it('서브관리자도 관리자 계열이다', () => {
    expect(isAdminRole('subadmin')).toBe(true);
  });

  it('DB담당자는 관리자가 아니다', () => {
    expect(isAdminRole('staff')).toBe(false);
  });

  it('지사는 관리자가 아니다', () => {
    expect(isAdminRole('user')).toBe(false);
  });

  it('알 수 없는 값도 관리자가 아니다', () => {
    expect(isAdminRole('')).toBe(false);
    expect(isAdminRole('manager')).toBe(false);
  });
});

describe('업로드를 쓸 수 있는 역할 (canUploadFiles)', () => {
  it('관리자는 쓸 수 있다', () => {
    expect(canUploadFiles('admin')).toBe(true);
  });

  it('서브관리자는 쓸 수 있다', () => {
    expect(canUploadFiles('subadmin')).toBe(true);
  });

  it('DB담당자는 쓸 수 있다', () => {
    expect(canUploadFiles('staff')).toBe(true);
  });

  it('지사는 못 쓴다', () => {
    expect(canUploadFiles('user')).toBe(false);
  });

  it('모르는 값도 못 쓴다', () => {
    expect(canUploadFiles('')).toBe(false);
    expect(canUploadFiles('manager')).toBe(false);
  });
});
