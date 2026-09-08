import { describe, it, expect } from 'vitest';
import { validateDepartmentContact, readDepartmentContact } from '@/lib/departments';

/**
 * 소속 연락처·이메일 검사. 화면과 서버가 같은 함수를 쓴다.
 *
 * 핵심은 **비어 있으면 통과**라는 것이다 — 역할 전용 소속에는 연락처가 있을 수
 * 없고, 이미 있는 지사도 나중에 채운다. 필수로 걸면 없는 값을 지어내게 된다.
 */
describe('소속 연락처 검사', () => {
  it('둘 다 비어 있으면 통과한다', () => {
    expect(validateDepartmentContact({})).toBeNull();
    expect(validateDepartmentContact({ phone: '', email: '' })).toBeNull();
    expect(validateDepartmentContact({ phone: '  ', email: null })).toBeNull();
  });

  it('바른 연락처는 통과한다 — 하이픈이 있든 없든', () => {
    expect(validateDepartmentContact({ phone: '010-1234-5678' })).toBeNull();
    expect(validateDepartmentContact({ phone: '01012345678' })).toBeNull();
    expect(validateDepartmentContact({ phone: '02-123-4567' })).toBeNull();
    expect(validateDepartmentContact({ phone: '031-123-4567' })).toBeNull();
  });

  it('자릿수가 모자라거나 넘치면 막는다', () => {
    expect(validateDepartmentContact({ phone: '010-1234' })).toMatch(/9~11자리/);
    expect(validateDepartmentContact({ phone: '010-1234-5678-90' })).toMatch(/9~11자리/);
  });

  it('숫자·하이픈 말고는 막는다', () => {
    expect(validateDepartmentContact({ phone: '010.1234.5678' })).toMatch(/숫자와 하이픈/);
    expect(validateDepartmentContact({ phone: '010 1234 5678' })).toMatch(/숫자와 하이픈/);
  });

  it('바른 이메일은 통과한다', () => {
    expect(validateDepartmentContact({ email: 'branch@example.com' })).toBeNull();
    expect(validateDepartmentContact({ email: 'a.b-c@sub.domain.co.kr' })).toBeNull();
  });

  it('모양이 틀린 이메일은 막는다', () => {
    expect(validateDepartmentContact({ email: 'no-at-sign' })).toMatch(/이메일 형식/);
    expect(validateDepartmentContact({ email: 'a@b' })).toMatch(/이메일 형식/);
    expect(validateDepartmentContact({ email: 'a b@c.com' })).toMatch(/이메일 형식/);
  });

  it('너무 긴 이메일은 막는다', () => {
    const long = 'a'.repeat(95) + '@b.com';
    expect(validateDepartmentContact({ email: long })).toMatch(/너무 깁니다/);
  });

  it('연락처가 틀리면 이메일이 맞아도 막는다 — 둘 다 봐야 한다', () => {
    expect(validateDepartmentContact({ phone: '12', email: 'ok@example.com' })).not.toBeNull();
  });
});

/**
 * 저장할 때 빈 값은 null이어야 한다. 빈 문자열이 쌓이면 "없음"과 "빈 값을
 * 저장함"이 구별되지 않고, 화면의 '연락처 없음' 판정도 흔들린다.
 */
describe('요청에서 연락처 꺼내기', () => {
  it('빈 값은 null이 된다', () => {
    expect(readDepartmentContact({})).toEqual({ phone: null, email: null });
    expect(readDepartmentContact({ phone: '', email: '  ' })).toEqual({ phone: null, email: null });
  });

  it('앞뒤 공백을 떼고 남긴다', () => {
    expect(readDepartmentContact({ phone: ' 010-1234-5678 ', email: ' a@b.com ' })).toEqual({
      phone: '010-1234-5678',
      email: 'a@b.com',
    });
  });

  it('연락처 말고 다른 것이 섞여 와도 둘만 꺼낸다', () => {
    const out = readDepartmentContact({ phone: '010-1234-5678', email: 'a@b.com', name: '지사', is_admin: true } as any);
    expect(Object.keys(out).sort()).toEqual(['email', 'phone']);
  });
});
