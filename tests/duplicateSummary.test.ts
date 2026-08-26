import { describe, it, expect } from 'vitest';
import {
  countDuplicatesByGroup,
  splitDuplicatesByGroup,
  toDuplicateBadges,
  badgesFromSheets,
} from '@/lib/duplicateSummary';
import {
  DUP_ORDER_REASON,
  DUP_CUSTOMER_REASON,
  DUP_CROSS_PHONE_REASON,
  BLACKLIST_REASON_LISTED,
  BLACKLIST_REASON_NEW,
} from '@/lib/insurance';

/**
 * 중복 미리보기 머리말의 갈래별 건수.
 *
 * 총 건수만 보여주면 무엇 때문에 빠졌는지 알려면 표를 훑어야 한다.
 */

const rows = (...reasons: string[]) => reasons.map((r) => [r, '값', '값']);

describe('갈래별 건수 세기', () => {
  it('사유별로 나눠 센다', () => {
    const got = countDuplicatesByGroup(
      rows(DUP_ORDER_REASON, DUP_CUSTOMER_REASON, DUP_CUSTOMER_REASON, DUP_CROSS_PHONE_REASON)
    );
    expect(got).toEqual([
      { sheet: '중복1', count: 1 },
      { sheet: '중복2', count: 2 },
      { sheet: '중복3', count: 1 },
      { sheet: '블랙리스트', count: 0 },
    ]);
  });

  it('0건인 갈래도 남긴다 — 빠지면 규칙이 없는 건지 안 걸린 건지 모른다', () => {
    const got = countDuplicatesByGroup(rows(DUP_ORDER_REASON));
    expect(got.map((g) => g.count)).toEqual([1, 0, 0, 0]);
  });

  it('시트 순서는 항상 1·2·3·블랙리스트다', () => {
    const got = countDuplicatesByGroup(rows(DUP_CROSS_PHONE_REASON, DUP_ORDER_REASON));
    expect(got.map((g) => g.sheet)).toEqual(['중복1', '중복2', '중복3', '블랙리스트']);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(countDuplicatesByGroup(undefined).map((g) => g.count)).toEqual([0, 0, 0, 0]);
    expect(countDuplicatesByGroup([]).map((g) => g.count)).toEqual([0, 0, 0, 0]);
  });

  it('모르는 사유는 어느 갈래에도 안 들어간다', () => {
    expect(countDuplicatesByGroup(rows('알 수 없는 사유')).map((g) => g.count)).toEqual([0, 0, 0, 0]);
  });

  /**
   * 블랙리스트는 사유가 둘이다. 게다가 새로 걸린 쪽은 뒤에 횟수가 붙는다.
   * 한 칸으로 합쳐 세지 않으면 화면에 실제보다 적게 나온다.
   */
  it('블랙리스트는 두 사유를 한 칸으로 합친다', () => {
    const got = countDuplicatesByGroup(
      rows(BLACKLIST_REASON_LISTED, `${BLACKLIST_REASON_NEW} (3회)`, `${BLACKLIST_REASON_NEW} (5회)`)
    );
    expect(got.find((g) => g.sheet === '블랙리스트')!.count).toBe(3);
  });
});

/**
 * 요약 버튼은 갈래마다 자기 목록만 열어야 한다. 배지 숫자와 열리는 목록이
 * 어긋나면 사람이 대조할 수 없으므로 세는 규칙과 나누는 규칙이 같아야 한다.
 */
describe('갈래별로 행 나누기', () => {
  it('사유가 맞는 행만 그 갈래에 넣는다', () => {
    const got = splitDuplicatesByGroup(
      rows(DUP_ORDER_REASON, DUP_CUSTOMER_REASON, DUP_CROSS_PHONE_REASON)
    );
    expect(got.map((g) => g.sheet)).toEqual(['중복1', '중복2', '중복3', '블랙리스트']);
    expect(got.map((g) => g.rows.length)).toEqual([1, 1, 1, 0]);
    expect(got[0].rows[0][0]).toBe(DUP_ORDER_REASON);
  });

  it('블랙리스트는 두 사유를 한 칸에 모은다', () => {
    const got = splitDuplicatesByGroup(
      rows(BLACKLIST_REASON_LISTED, `${BLACKLIST_REASON_NEW} (3회)`)
    );
    expect(got.find((g) => g.sheet === '블랙리스트')!.rows).toHaveLength(2);
  });

  it('건수와 나눈 결과가 어긋나지 않는다', () => {
    const input = rows(
      DUP_ORDER_REASON,
      DUP_CUSTOMER_REASON,
      DUP_CUSTOMER_REASON,
      BLACKLIST_REASON_LISTED,
      `${BLACKLIST_REASON_NEW} (4회)`
    );
    expect(splitDuplicatesByGroup(input).map((g) => g.rows.length)).toEqual(
      countDuplicatesByGroup(input).map((g) => g.count)
    );
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(splitDuplicatesByGroup(undefined).map((g) => g.rows.length)).toEqual([0, 0, 0, 0]);
  });

  it('모르는 사유는 어느 갈래에도 안 들어간다', () => {
    expect(splitDuplicatesByGroup(rows('알 수 없는 사유')).map((g) => g.rows.length)).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe('화면에 띄울 배지', () => {
  it('갈래별 건수를 순서대로 준다', () => {
    const got = toDuplicateBadges(
      rows(DUP_ORDER_REASON, DUP_CUSTOMER_REASON, DUP_CUSTOMER_REASON, DUP_CROSS_PHONE_REASON)
    );
    expect(got).toEqual([
      { sheet: '중복1', count: 1 },
      { sheet: '중복2', count: 2 },
      { sheet: '중복3', count: 1 },
      { sheet: '블랙리스트', count: 0 },
    ]);
  });

  it('하나도 없으면 빈 배열 — 0만 늘어놓아도 읽을 게 없다', () => {
    expect(toDuplicateBadges([])).toEqual([]);
    expect(toDuplicateBadges(undefined)).toEqual([]);
  });

  it('한 갈래만 걸려도 나머지를 0으로 함께 보여준다', () => {
    expect(toDuplicateBadges(rows(DUP_ORDER_REASON)).map((g) => g.count)).toEqual([1, 0, 0, 0]);
  });
});

describe('엑셀 시트에서 직접 세기 (원본 파일 미리보기)', () => {
  it('중복 시트의 행 수를 갈래별로 준다', () => {
    const got = badgesFromSheets({ 원본: 29, '분류 결과': 27, 중복1: 1, 중복2: 0, 중복3: 1, 블랙리스트: 2 });
    expect(got).toEqual([
      { sheet: '중복1', count: 1 },
      { sheet: '중복2', count: 0 },
      { sheet: '중복3', count: 1 },
      { sheet: '블랙리스트', count: 2 },
    ]);
  });

  it('중복 시트가 없는 파일에는 아무것도 안 그린다', () => {
    // 배포본이나 예전에 만든 파일이 여기 해당한다
    expect(badgesFromSheets({ Sheet1: 29 })).toEqual([]);
    expect(badgesFromSheets({})).toEqual([]);
    expect(badgesFromSheets(undefined)).toEqual([]);
  });

  it('일부 시트만 있어도 나머지를 0으로 채운다', () => {
    expect(badgesFromSheets({ 중복1: 3 }).map((g) => g.count)).toEqual([3, 0, 0, 0]);
  });
});
