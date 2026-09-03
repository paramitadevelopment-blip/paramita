import { describe, it, expect } from 'vitest';
import { formatPhone } from '@/lib/phoneFormat';
import { normalizePhone } from '@/lib/insurance';

/**
 * 화면에서 전화번호에 하이픈을 넣는 규칙.
 *
 * 보여 주기 위한 것이라 저장값을 바꾸지는 않지만, 잘못 끊으면 같은 번호가
 * 다른 번호처럼 보여 "이 사람 번호가 바뀌었나" 하게 된다.
 */

describe('휴대전화', () => {
  const cases: Array<[string, string]> = [
    ['01012345678', '010-1234-5678'],
    ['010-1234-5678', '010-1234-5678'],
    ['010 1234 5678', '010-1234-5678'],
    ['0101234567', '010-1234-567'],
  ];

  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => {
      expect(formatPhone(input)).toBe(expected);
    });
  }

  /** 치는 도중에도 불린다. 덜 채운 상태가 어색하면 커서가 튀는 것처럼 보인다. */
  it('치는 도중에도 자연스럽다', () => {
    expect(formatPhone('0')).toBe('0');
    expect(formatPhone('010')).toBe('010');
    expect(formatPhone('0101')).toBe('010-1');
    expect(formatPhone('0101234')).toBe('010-1234');
    expect(formatPhone('01012345')).toBe('010-1234-5');
  });

  /** 11자리를 넘겨 쳐도 번호가 길어지지 않는다. */
  it('11자리에서 끊는다', () => {
    expect(formatPhone('010123456789999')).toBe('010-1234-5678');
  });
});

/**
 * 서울은 국번이 두 자리다. 3-4-4로 자르면 02-123-4567이 021-234-567이 되어
 * 전혀 다른 번호처럼 읽힌다.
 */
describe('서울 지역번호', () => {
  it('9자리는 02-123-4567', () => {
    expect(formatPhone('021234567')).toBe('02-123-4567');
  });

  it('10자리는 02-1234-5678', () => {
    expect(formatPhone('0212345678')).toBe('02-1234-5678');
  });

  it('치는 도중에도 두 자리로 끊는다', () => {
    expect(formatPhone('02')).toBe('02');
    expect(formatPhone('021')).toBe('02-1');
  });
});

/**
 * 지역번호가 세 자리인 곳은 10자리면 국번이 세 자리다(031-123-4567).
 * 휴대전화처럼 3-4-4로 끊으면 031-1234-567이 되어 마지막 자리가 빠진 것처럼 보인다.
 */
describe('그 밖의 지역번호', () => {
  it('10자리는 031-123-4567', () => {
    expect(formatPhone('0311234567')).toBe('031-123-4567');
  });

  it('11자리는 070-1234-5678', () => {
    expect(formatPhone('07012345678')).toBe('070-1234-5678');
  });
});

describe('빈 값과 숫자가 아닌 값', () => {
  it('숫자가 없으면 빈 문자열', () => {
    expect(formatPhone('')).toBe('');
    expect(formatPhone('abc')).toBe('');
    expect(formatPhone('---')).toBe('');
  });
});

/**
 * 하이픈을 넣어도 저장·조회에 쓰는 값은 그대로여야 한다.
 * 여기가 어긋나면 화면에서는 같은 번호인데 중복·매칭에서 다른 사람이 된다.
 */
describe('저장값은 달라지지 않는다', () => {
  it('하이픈을 넣기 전과 후의 숫자가 같다', () => {
    for (const raw of ['01012345678', '021234567', '0311234567']) {
      expect(normalizePhone(formatPhone(raw))).toBe(normalizePhone(raw));
    }
  });
});
