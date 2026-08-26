import { describe, it, expect } from 'vitest';
import {
  fillPhones,
  phoneShape,
  dedupeAgainstHistory,
  type DedupeKey,
} from '@/lib/historyDedupe';

/**
 * 과거 30일과 대조하는 중복 판정.
 *
 * 과하게 지우면 진짜 고객이 사라지고, 덜 지우면 같은 사람에게 두 번 연락이 간다.
 * 둘 다 되돌릴 수 없는 실수라 경계를 분명히 해둔다.
 */

const row = (o: Partial<DedupeKey>): DedupeKey => ({
  name: '홍길동',
  tel1: '010-1111-1111',
  tel2: '010-1111-1111',
  birth: '5801011******',
  ...o,
});

const run = (items: DedupeKey[], past: DedupeKey[]) =>
  dedupeAgainstHistory(items, (x) => x, past);

describe('빈 전화번호 채우기', () => {
  it('한 칸이 비면 있는 값으로 채운다', () => {
    expect(fillPhones(row({ tel1: '', tel2: '010-2222-2222' })).tel1).toBe('01022222222');
    expect(fillPhones(row({ tel1: '010-3333-3333', tel2: '' })).tel2).toBe('01033333333');
  });

  it('둘 다 비면 그대로 둔다 — 채울 게 없다', () => {
    const f = fillPhones(row({ tel1: '', tel2: '' }));
    expect(f.tel1).toBe('');
    expect(f.tel2).toBe('');
  });

  it('표기가 달라도 같은 번호로 본다', () => {
    expect(fillPhones(row({ tel1: '010-1111-1111', tel2: '01011111111' })).tel1)
      .toBe(fillPhones(row({ tel1: '010 1111 1111', tel2: '' })).tel1);
  });
});

describe('갈래 나누기', () => {
  it('두 번호가 같으면 samePhone', () => {
    expect(phoneShape(row({ tel1: '010-1111-1111', tel2: '01011111111' }))).toBe('samePhone');
  });

  it('두 번호가 다르면 crossPhone', () => {
    expect(phoneShape(row({ tel1: '010-1111-1111', tel2: '010-2222-2222' }))).toBe('crossPhone');
  });

  it('한 칸이 비어 있으면 채운 뒤 판단해 samePhone이 된다', () => {
    // 채우기 전에 판단하면 "다르다"로 잘못 갈라져 엉뚱한 갈래로 간다
    expect(phoneShape(row({ tel1: '', tel2: '010-2222-2222' }))).toBe('samePhone');
  });
});

describe('중복2 — 번호가 같은 갈래 (이름 + 전화번호)', () => {
  it('과거에 같은 이름·번호가 있으면 뺀다', () => {
    const r = run([row({})], [row({})]);
    expect(r.removedSamePhone).toHaveLength(1);
    expect(r.items).toHaveLength(0);
  });

  it('이름이 다르면 살린다', () => {
    const r = run([row({ name: '김철수' })], [row({ name: '홍길동' })]);
    expect(r.items).toHaveLength(1);
    expect(r.removedSamePhone).toHaveLength(0);
  });

  it('번호가 다르면 살린다', () => {
    const r = run([row({ tel1: '010-9999-9999', tel2: '010-9999-9999' })], [row({})]);
    expect(r.items).toHaveLength(1);
  });

  it('과거가 없으면 전부 살린다', () => {
    expect(run([row({}), row({ name: '김철수' })], []).items).toHaveLength(2);
  });

  it('이름이 비면 판정하지 않는다 — 근거가 없다', () => {
    const r = run([row({ name: '' })], [row({ name: '' })]);
    expect(r.items).toHaveLength(1);
  });

  it('번호가 둘 다 비면 판정하지 않는다', () => {
    const r = run([row({ tel1: '', tel2: '' })], [row({ tel1: '', tel2: '' })]);
    expect(r.items).toHaveLength(1);
  });
});

describe('중복3 — 번호가 어긋난 갈래 (이름 + 생년월일 + 번호 겹침)', () => {
  const past = row({ tel1: '010-1111-1111', tel2: '010-2222-2222' });

  it('번호 위치가 뒤바뀐 같은 사람을 잡는다', () => {
    // 이게 이 갈래를 만든 이유다. Tel2끼리만 보면 2222 != 1111 이라 못 잡는다
    const now = row({ tel1: '010-2222-2222', tel2: '010-1111-1111' });
    const r = run([now], [past]);
    expect(r.removedCrossPhone).toHaveLength(1);
    expect(r.items).toHaveLength(0);
  });

  it('번호 하나만 겹쳐도 잡는다', () => {
    const now = row({ tel1: '010-2222-2222', tel2: '010-8888-8888' });
    expect(run([now], [past]).removedCrossPhone).toHaveLength(1);
  });

  it('생년월일이 다르면 살린다 — 동명이인을 지우지 않으려는 것', () => {
    const now = row({ tel1: '010-2222-2222', tel2: '010-1111-1111', birth: '7005152******' });
    expect(run([now], [past]).items).toHaveLength(1);
  });

  it('이름이 같고 번호가 겹쳐도 생년월일이 비면 살린다', () => {
    const now = row({ tel1: '010-2222-2222', tel2: '010-1111-1111', birth: '' });
    expect(run([now], [past]).items).toHaveLength(1);
  });

  it('번호가 하나도 안 겹치면 살린다', () => {
    const now = row({ tel1: '010-7777-7777', tel2: '010-8888-8888' });
    expect(run([now], [past]).items).toHaveLength(1);
  });
});

describe('두 갈래가 서로 섞이지 않는다', () => {
  it('한 행은 한쪽에만 들어간다', () => {
    const same = row({ name: '가나다' });
    const cross = row({ name: '라마바', tel1: '010-2222-2222', tel2: '010-1111-1111' });
    const r = run(
      [same, cross],
      [row({ name: '가나다' }), row({ name: '라마바', tel1: '010-1111-1111', tel2: '010-2222-2222' })]
    );
    expect(r.removedSamePhone).toEqual([same]);
    expect(r.removedCrossPhone).toEqual([cross]);
    expect(r.items).toHaveLength(0);
  });

  it('번호가 같은 행은 crossPhone 갈래를 타지 않는다', () => {
    // 생년월일이 같고 번호도 겹치지만, 번호가 같은 행이라 중복2 규칙만 본다
    const now = row({ tel1: '010-5555-5555', tel2: '010-5555-5555' });
    const past = row({ tel1: '010-5555-5555', tel2: '010-6666-6666' });
    const r = run([now], [past]);
    expect(r.removedCrossPhone).toHaveLength(0);
    expect(r.items).toHaveLength(1);
  });
});
