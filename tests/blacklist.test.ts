import { describe, it, expect } from 'vitest';
import {
  isSamePerson,
  isJudgeable,
  splitAlreadyListed,
  splitOverThreshold,
  type BlacklistKey,
} from '@/lib/blacklist';

/**
 * 블랙리스트 판정.
 *
 * 한 번 오르면 자동으로는 안 풀린다. 잘못 엮이면 멀쩡한 고객이 영영 막히므로
 * 경계를 분명히 해둔다. 반대로 덜 잡으면 규칙이 헛돈다.
 */

const key = (o: Partial<BlacklistKey> = {}): BlacklistKey => ({
  product: '동양생명 치매간병보험',
  birth: '580101',
  tel1: '010-1111-1111',
  tel2: '010-1111-1111',
  ...o,
});

/**
 * 실제 파이프라인과 같은 순서로 돌린다.
 *   주문번호 중복 제거 → ① 명단 확인 → ② 60일 3회 → 30일 중복 제거 → 배정
 *
 * 명단 확인이 먼저여야 사유가 '블랙리스트 등록됨'으로 정확히 남고,
 * 3회 카운트가 30일 중복보다 먼저여야 원천 내역대로 세어진다.
 */
const run = (items: BlacklistKey[], listed: BlacklistKey[], recent: BlacklistKey[]) => {
  const first = splitAlreadyListed(items, (x) => x, listed);
  const second = splitOverThreshold(first.items, (x) => x, recent);
  return { items: second.items, registered: first.registered, newlyHit: second.newlyHit };
};

describe('같은 사람인가', () => {
  it('상품·생년월일이 같고 번호가 겹치면 같은 사람', () => {
    expect(isSamePerson(key(), key())).toBe(true);
  });

  /**
   * 생년월일은 파일마다 표기가 제각각이다 — DB에는 가려진 원문("5801011******"),
   * 파일에는 "580101-1", 어떤 건 "1958-01-01". 이걸 조건에 넣으면 같은 사람을
   * 놓친다. 사람을 가리는 값은 번호다.
   */
  it('생년월일이 어떻게 적혀 있든 번호가 겹치면 같은 사람', () => {
    expect(isSamePerson(key({ birth: '5801011******' }), key({ birth: '580101-1' }))).toBe(true);
    expect(isSamePerson(key({ birth: '1958-01-01' }), key({ birth: '' }))).toBe(true);
  });

  it('이름은 보지 않는다 — 오타·띄어쓰기로 흔들려 같은 사람을 놓친다', () => {
    // BlacklistKey에 이름 자리가 아예 없다. 판정에 못 새어 들어가게 한 것이다.
    expect(Object.keys(key())).not.toContain('name');
  });

  it('명단에 오른 사람은 배정에서 빠진다', () => {
    const result = run([key()], [key()], []);

    expect(result.registered).toHaveLength(1);
    expect(result.items).toHaveLength(0);
  });
});

/**
 * 관리자가 손으로 올린 명단.
 *
 * 상품을 받지 않으므로 "어느 상품으로 와도 막아라"는 뜻이다. 상품을 조건에
 * 넣으면 한 건도 안 걸려 수동 등록이 아무 효력이 없다.
 */
describe('수동 등록 명단 (상품 없음)', () => {
  const 수동 = (o: Partial<BlacklistKey> = {}): BlacklistKey =>
    key({ product: '', ...o });

  it('상품이 달라도 생년월일·번호가 맞으면 막는다', () => {
    const result = run([key({ product: '흥국생명 암보험' })], [수동()], []);

    expect(result.registered).toHaveLength(1);
    expect(result.items).toHaveLength(0);
  });

  it('번호가 겹치기만 하면 칸이 뒤바뀌어도 막는다', () => {
    const listed = [수동({ tel1: '010-2222-2222', tel2: '' })];
    const 오늘 = key({ tel1: '010-9999-9999', tel2: '010-2222-2222' });

    expect(run([오늘], listed, []).registered).toHaveLength(1);
  });

  it('생년월일이 비어 있어도 번호가 맞으면 막는다', () => {
    expect(run([key()], [수동({ birth: '' })], []).registered).toHaveLength(1);
  });

  it('번호가 하나도 안 겹치면 막지 않는다', () => {
    const listed = [수동({ tel1: '010-8888-8888', tel2: '010-8888-8888' })];

    expect(run([key()], listed, []).registered).toHaveLength(0);
  });

  it('번호가 비면 판정하지 않는다 — 근거 없이 영구 차단하지 않는다', () => {
    expect(run([key()], [수동({ tel1: '', tel2: '' })], []).registered).toHaveLength(0);
  });

  it('번호 위치가 뒤바뀌어도 같은 사람', () => {
    const a = key({ tel1: '010-1111-1111', tel2: '010-2222-2222' });
    const b = key({ tel1: '010-2222-2222', tel2: '010-1111-1111' });
    expect(isSamePerson(a, b)).toBe(true);
  });

  it('번호 하나만 겹쳐도 같은 사람', () => {
    const a = key({ tel1: '010-1111-1111', tel2: '010-9999-9999' });
    const b = key({ tel1: '010-2222-2222', tel2: '010-1111-1111' });
    expect(isSamePerson(a, b)).toBe(true);
  });

  it('상품이 다르면 다른 건 — 한 사람이 여러 상품에 가입할 수 있다', () => {
    expect(isSamePerson(key(), key({ product: '동양생명 암보험' }))).toBe(false);
  });

  it('번호가 하나도 안 겹치면 다른 사람', () => {
    const b = key({ tel1: '010-7777-7777', tel2: '010-8888-8888' });
    expect(isSamePerson(key(), b)).toBe(false);
  });

  it('표기가 흔들려도 같은 값으로 본다', () => {
    const a = key({ product: '  동양생명   치매간병보험 ', tel1: '01011111111' });
    expect(isSamePerson(a, key())).toBe(true);
  });
});

describe('판정할 수 있는 값인가', () => {
  it('상품과 번호가 있어야 판정한다', () => {
    expect(isJudgeable(key())).toBe(true);
  });

  it('상품이나 번호가 비면 판정하지 않는다 — 근거 없이 영구 차단하지 않는다', () => {
    expect(isJudgeable(key({ product: '' }))).toBe(false);
    expect(isJudgeable(key({ tel1: '', tel2: '' }))).toBe(false);
  });

  it('생년월일은 판정에 쓰지 않으므로 비어도 된다', () => {
    expect(isJudgeable(key({ birth: '' }))).toBe(true);
  });

  it('번호는 한쪽만 있어도 된다', () => {
    expect(isJudgeable(key({ tel1: '', tel2: '010-1111-1111' }))).toBe(true);
  });
});

describe('3회 기준 (오늘 건까지 합쳐서 셈)', () => {
  it('과거 2번 + 오늘 1번 = 3번 → 막힌다', () => {
    const r = run([key()], [], [key(), key()]);
    expect(r.newlyHit).toHaveLength(1);
    expect(r.newlyHit[0].count).toBe(3);
    expect(r.items).toHaveLength(0);
  });

  it('과거 1번 + 오늘 1번 = 2번 → 통과', () => {
    const r = run([key()], [], [key()]);
    expect(r.items).toHaveLength(1);
    expect(r.newlyHit).toHaveLength(0);
  });

  it('과거가 없으면 통과', () => {
    expect(run([key()], [], []).items).toHaveLength(1);
  });

  it('오늘만 3번이어도 막힌다', () => {
    const r = run([key(), key(), key()], [], []);
    expect(r.newlyHit).toHaveLength(3);
    expect(r.items).toHaveLength(0);
  });

  it('오늘 2번은 통과', () => {
    expect(run([key(), key()], [], []).items).toHaveLength(2);
  });

  it('다른 사람은 따로 센다', () => {
    const 갑 = key();
    const 을 = key({ tel1: '010-3333-3333', tel2: '010-3333-3333' });
    const r = run([갑, 을], [], [갑, 갑]);
    expect(r.newlyHit.map((h) => h.item)).toEqual([갑]);
    expect(r.items).toEqual([을]);
  });

  it('판정 못 할 값은 몇 번이든 통과', () => {
    // 근거가 없는데 영구 차단하면 되돌릴 수 없다.
    for (const 무근거 of [key({ product: '' }), key({ tel1: '', tel2: '' })]) {
      expect(run([무근거], [], [무근거, 무근거, 무근거]).items).toHaveLength(1);
    }
  });
});

/** 이게 이 기능의 핵심이다. 기간이 지나도 풀리면 안 된다. */
describe('명단에 오르면 영구히 막힌다', () => {
  it('최근 신청이 하나도 없어도 명단에 있으면 막힌다', () => {
    const r = run([key()], [key()], []);
    expect(r.registered).toHaveLength(1);
    expect(r.items).toHaveLength(0);
  });

  it('명단에 있으면 이번에 걸린 것으로 다시 세지 않는다', () => {
    // 두 번 등록되면 명단에 같은 사람이 쌓인다
    const r = run([key()], [key()], [key(), key()]);
    expect(r.registered).toHaveLength(1);
    expect(r.newlyHit).toHaveLength(0);
  });

  it('명단의 다른 사람에는 걸리지 않는다', () => {
    const 남 = key({ birth: '7005152******', tel1: '010-3333-3333', tel2: '010-3333-3333' });
    expect(run([key()], [남], []).items).toHaveLength(1);
  });

  it('명단도 번호 묶음으로 본다', () => {
    const 명단 = key({ tel1: '010-1111-1111', tel2: '010-2222-2222' });
    const 오늘 = key({ tel1: '010-2222-2222', tel2: '010-5555-5555' });
    expect(run([오늘], [명단], []).registered).toHaveLength(1);
  });
});

describe('세 갈래가 섞이지 않는다', () => {
  it('한 행은 한 갈래에만 들어간다', () => {
    const 등록됨 = key();
    const 이번에 = key({ birth: '6001011******', tel1: '010-4444-4444', tel2: '010-4444-4444' });
    const 통과 = key({ birth: '9001011******', tel1: '010-6666-6666', tel2: '010-6666-6666' });

    const r = run([등록됨, 이번에, 통과], [등록됨], [이번에, 이번에]);
    expect(r.registered).toEqual([등록됨]);
    expect(r.newlyHit.map((h) => h.item)).toEqual([이번에]);
    expect(r.items).toEqual([통과]);
  });

  it('빈 입력에도 터지지 않는다', () => {
    const r = run([], [], []);
    expect(r.items).toEqual([]);
    expect(r.registered).toEqual([]);
    expect(r.newlyHit).toEqual([]);
  });
});

/**
 * 명단 확인이 3회 카운트보다 먼저 돌아야 한다.
 *
 * 뒤로 미루면 명단에 오른 사람이 '중복'이나 '3회 초과'로 분류되어
 * 사유가 틀리게 남는다. 관리자가 블랙리스트 시트를 열었을 때 그 사람이 없다.
 */
describe('판정 순서', () => {
  /**
   * 3회 카운트는 30일 중복 제거보다 앞이어야 한다.
   * 뒤로 미루면 2번째 신청부터 30일 중복이 다 걷어가 3회에 영영 도달하지 못한다.
   */
  it('30일 중복으로 빠질 건도 신청 횟수로 센다', () => {
    // 과거에 2번 있었고 오늘 1번 더 — 오늘 건은 30일 중복이지만 3회째로 센다
    const 사람 = key();
    const only = splitOverThreshold([사람], (x) => x, [사람, 사람]);
    expect(only.newlyHit).toHaveLength(1);
    expect(only.newlyHit[0].count).toBe(3);
  });

  it('명단에 있으면 3회를 채웠더라도 등록됨으로 분류된다', () => {
    const 사람 = key();
    const r = run([사람], [사람], [사람, 사람, 사람]);
    expect(r.registered).toEqual([사람]);
    expect(r.newlyHit).toHaveLength(0);
  });

  it('명단 확인은 최근 기록을 보지 않는다', () => {
    // 명단만 있고 최근 신청이 하나도 없어도 막혀야 한다
    const only = splitAlreadyListed([key()], (x) => x, [key()]);
    expect(only.registered).toHaveLength(1);
    expect(only.items).toHaveLength(0);
  });

  it('3회 카운트는 명단을 보지 않는다', () => {
    // 명단에 있든 없든 이 함수는 횟수만 센다. 거르는 건 앞 단계 몫이다.
    const only = splitOverThreshold([key()], (x) => x, [key(), key()]);
    expect(only.newlyHit).toHaveLength(1);
    expect(only.newlyHit[0].count).toBe(3);
  });
});
