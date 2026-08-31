import { describe, it, expect } from 'vitest';
import { parseDateCell } from '@/lib/parseDateCell';
import { formatCellValue } from '@/lib/excelCell';
import { formatAssignedAt } from '@/lib/insurance';

/**
 * 파일에 글자로 적혀 있는 날짜를 다시 읽는다.
 *
 * 배정날짜는 우리가 `formatAssignedAt`으로 적어 둔 것이고, 접수일자는 거래처가
 * 준 값이다. 못 읽은 값을 오늘로 때우면 "언제 배정됐나"가 조용히 틀려서
 * 지사가 엉뚱한 날짜를 보고 고객에게 연락한다.
 */

describe('배정날짜 — 우리가 적은 형식', () => {
  /** 우리가 쓴 것을 우리가 다시 읽는다. 이게 어긋나면 전부 못 읽는다. */
  it('formatAssignedAt 이 만든 값을 그대로 되읽는다', () => {
    for (const original of [
      new Date(2026, 7, 25, 17, 19, 52),
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 11, 31, 23, 59, 59),
      new Date(2026, 5, 15, 12, 0, 0),
    ]) {
      expect(parseDateCell(formatAssignedAt(original))).toEqual(original);
    }
  });

  it('오후 시각을 24시간제로 읽는다', () => {
    expect(parseDateCell('2026. 8. 25 오후 05:19:52')).toEqual(new Date(2026, 7, 25, 17, 19, 52));
  });

  it('오전 시각은 그대로', () => {
    expect(parseDateCell('2026. 8. 25 오전 09:30:00')).toEqual(new Date(2026, 7, 25, 9, 30, 0));
  });

  /** 여기를 뒤집으면 12시간이 어긋난다. 정오·자정은 규칙이 반대다. */
  it('오후 12시는 12시, 오전 12시는 0시', () => {
    expect(parseDateCell('2026. 8. 25 오후 12:00:00')).toEqual(new Date(2026, 7, 25, 12, 0, 0));
    expect(parseDateCell('2026. 8. 25 오전 12:00:00')).toEqual(new Date(2026, 7, 25, 0, 0, 0));
  });
});

describe('접수일자 — 거래처가 준 형식', () => {
  it('하이픈 날짜', () => {
    expect(parseDateCell('2026-08-11')).toEqual(new Date(2026, 7, 11));
  });

  it('슬래시 날짜와 시각', () => {
    expect(parseDateCell('2026/08/11 13:00')).toEqual(new Date(2026, 7, 11, 13, 0, 0));
  });

  it('시각이 없으면 그날 0시로 본다', () => {
    expect(parseDateCell('2026-08-11')?.getHours()).toBe(0);
  });
});

describe('못 읽는 값', () => {
  it('Date 는 같은 날을 가리킨다', () => {
    const d = new Date(2026, 7, 11);
    const got = parseDateCell(d)!;

    expect(got.getFullYear()).toBe(2026);
    expect(got.getMonth()).toBe(7);
    expect(got.getDate()).toBe(11);
  });

  /**
   * xlsx가 만든 Date는 1899년 서울 표준시(UTC+8:27:52)의 52초 오차 때문에
   * 자정이 아니라 전날 23:59:08로 들어온다. 그대로 연·월·일을 읽으면 하루
   * 전 날짜가 나와, 파일에 적힌 날짜(formatCellValue)와 비교값이 어긋난다.
   */
  it('엑셀이 준 Date가 자정 직전으로 밀려 있어도 그날로 읽는다', () => {
    // 8/11 00:00 에서 52초 모자란 값 — xlsx 가 실제로 주는 모양
    const 밀린값 = new Date(new Date(2026, 7, 11).getTime() - 52_000);

    const got = parseDateCell(밀린값)!;

    expect(got.getDate()).toBe(11);
    expect(got.getMonth()).toBe(7);
  });

  /** 파일에 적히는 값과 비교에 쓰는 값이 같은 날을 가리켜야 한다. */
  it('formatCellValue 가 적은 날짜와 같은 날로 읽힌다', () => {
    const 밀린값 = new Date(new Date(2026, 7, 11).getTime() - 52_000);

    const 적힌글자 = formatCellValue(밀린값) as string;
    const 다시읽음 = parseDateCell(밀린값)!;

    expect(적힌글자.slice(0, 10)).toBe('2026-08-11');
    expect(parseDateCell(적힌글자)!.getTime()).toBe(다시읽음.getTime());
  });

  it('빈 값·글자는 null', () => {
    for (const v of ['', null, undefined, '확인불가', '없음']) {
      expect(parseDateCell(v)).toBeNull();
    }
  });

  it('없는 날짜는 null — 3월로 넘어가게 두지 않는다', () => {
    expect(parseDateCell('2026-02-30')).toBeNull();
    expect(parseDateCell('2026-13-01')).toBeNull();
  });

  it('잘못된 Date 객체는 null', () => {
    expect(parseDateCell(new Date('없는날짜'))).toBeNull();
  });

  /** 앞에서 시각을 찾으면 연·월·일 숫자를 시로 잘못 읽는다. */
  it('연도 숫자를 시각으로 오해하지 않는다', () => {
    expect(parseDateCell('2026-08-11')?.getHours()).toBe(0);
  });
});
