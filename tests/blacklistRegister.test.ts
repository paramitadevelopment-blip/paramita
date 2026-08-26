import { describe, it, expect } from 'vitest';
import { normalizeBirth, normalizePhone } from '@/lib/insurance';
import { formatJuminForDisplay, digitsOnly } from '@/lib/columnAliases';

/**
 * 블랙리스트 수동 등록에서 값이 흐르는 길.
 *
 *   모달 입력(앞 6자리 + 성별 1자리) → normalizeBirth → DB(birth) → 화면 표시
 *
 * 중간 어디서든 성별 코드가 떨어지면 화면에 `970107`까지만 나온다.
 * 저장할 때와 보여줄 때가 다른 규칙을 쓰면 그런 일이 생기므로 양쪽을 한 줄로 엮어 본다.
 */

/** 모달이 서버로 보내는 값. `birthDate + birthGender`를 그대로 잇는다. */
const 모달입력 = (birthDate: string, birthGender: string) => birthDate + birthGender;

/** POST 라우트가 DB에 넣는 값 */
const 저장값 = (birth: string) => normalizeBirth(birth);

describe('수동 등록 — 주민번호 앞자리 + 성별 코드', () => {
  it('입력한 성별 코드가 저장된다', () => {
    expect(저장값(모달입력('970107', '1'))).toBe('9701071');
  });

  it('저장된 값이 화면에 성별 코드까지 나온다', () => {
    expect(formatJuminForDisplay(저장값(모달입력('970107', '1')))).toBe('970107-1');
  });

  it('성별 코드 1~4를 모두 그대로 싣는다', () => {
    for (const gender of ['1', '2', '3', '4']) {
      expect(저장값(모달입력('970107', gender))).toBe(`970107${gender}`);
      expect(formatJuminForDisplay(저장값(모달입력('970107', gender)))).toBe(
        `970107-${gender}`
      );
    }
  });

  it('2000년대생(3·4)도 앞자리가 안 잘린다', () => {
    expect(저장값(모달입력('050307', '3'))).toBe('0503073');
    expect(formatJuminForDisplay('0503073')).toBe('050307-3');
  });

  it('0으로 시작하는 생년월일이 살아남는다 — 숫자로 바뀌면 앞 0이 날아간다', () => {
    expect(저장값(모달입력('050307', '3'))).toHaveLength(7);
    expect(저장값(모달입력('050307', '3')).startsWith('0')).toBe(true);
  });
});

/**
 * 앞자리 칸은 6글자까지만 받는다. 하이픈이 한 글자 섞이면 그만큼 진짜 숫자가
 * 밀려 잘리고, 뒤에 성별 코드를 이어붙여도 6자리라 성별이 통째로 사라진다.
 * 화면에는 성별 코드 없이 `970107`만 나온다 — 저장이 안 된 것처럼 보이는 그 증상이다.
 */
describe('입력창이 숫자만 받는다', () => {
  it('하이픈이 섞이면 진짜 숫자가 밀려 잘린다 — 걸러내지 않으면 성별이 사라진다', () => {
    const 안거른값 = '97-0107'.slice(0, 6); // maxLength만 믿었을 때
    expect(저장값(모달입력(안거른값, '1'))).toBe('970101');
    expect(formatJuminForDisplay(저장값(모달입력(안거른값, '1')))).toBe('970101');
  });

  it('걸러내면 여섯 자리가 온전히 남아 성별까지 저장된다', () => {
    const 거른값 = digitsOnly('97-0107', 6);
    expect(거른값).toBe('970107');
    expect(저장값(모달입력(거른값, '1'))).toBe('9701071');
    expect(formatJuminForDisplay(저장값(모달입력(거른값, '1')))).toBe('970107-1');
  });

  it('공백·문자도 걸러낸다', () => {
    expect(digitsOnly('97 01 07', 6)).toBe('970107');
    expect(digitsOnly('9a7b0c1d07', 6)).toBe('970107');
  });

  it('성별 칸은 한 자리만 받는다', () => {
    expect(digitsOnly('12', 1)).toBe('1');
    expect(digitsOnly('-1', 1)).toBe('1');
  });
});

describe('표시 — 저장된 모양이 달라도 한 꼴로 보여준다', () => {
  it('수동 등록분 (7자리)', () => {
    expect(formatJuminForDisplay('9701071')).toBe('970107-1');
  });

  it('파일에서 온 값 (가려진 원문)', () => {
    expect(formatJuminForDisplay('9701071******')).toBe('970107-1');
  });

  it('하이픈이 섞인 값', () => {
    expect(formatJuminForDisplay('970107-1')).toBe('970107-1');
  });

  // 하이픈만 덩그러니 남으면 뒤가 잘린 것처럼 보인다.
  it('성별 코드가 없으면 하이픈째로 뗀다', () => {
    expect(formatJuminForDisplay('970107')).toBe('970107');
  });

  it('뒷자리 별표는 붙이지 않는다', () => {
    expect(formatJuminForDisplay('9701071')).not.toContain('*');
  });

  it('빈 값이나 못 읽는 값은 - 로 둔다', () => {
    expect(formatJuminForDisplay('')).toBe('-');
    expect(formatJuminForDisplay(null)).toBe('-');
    expect(formatJuminForDisplay('확인불가')).toBe('-');
    expect(formatJuminForDisplay('12345')).toBe('-');
  });
});

/**
 * 전화번호는 판정 기준이라 저장 모양이 흔들리면 같은 사람을 못 찾는다.
 * 모달은 하이픈을 자동으로 넣고, 서버는 그걸 다시 벗겨 저장한다.
 */
describe('수동 등록 — 전화번호', () => {
  it('하이픈을 벗겨 저장한다', () => {
    expect(normalizePhone('010-2690-9153')).toBe('01026909153');
  });

  it('모달이 넣은 하이픈과 사람이 친 숫자가 같은 값이 된다', () => {
    expect(normalizePhone('010-2690-9153')).toBe(normalizePhone('01026909153'));
  });

  it('전화번호2를 비워두면 전화번호1과 같은 값이 들어간다', () => {
    const tel1 = '010-2690-9153';
    const tel2 = '';
    // 모달이 `tel2 || tel1`로 보내고, 서버도 `phone2 || phone1`로 받는다.
    expect(normalizePhone(tel2 || tel1)).toBe(normalizePhone(tel1));
  });

  it('두 번호가 다르면 둘 다 남는다 — 하나만 겹쳐도 같은 사람이므로', () => {
    const keys = Array.from(
      new Set([normalizePhone('010-1111-1111'), normalizePhone('010-2222-2222')].filter(Boolean))
    );
    expect(keys).toEqual(['01011111111', '01022222222']);
  });
});
