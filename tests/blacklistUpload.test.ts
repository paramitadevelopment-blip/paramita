import { describe, it, expect } from 'vitest';
import {
  dedupeByOrderNumber,
  normalizeBirth,
  BLACKLIST_DAYS,
  DUP_ORDER_REASON,
  DUP_CUSTOMER_REASON,
} from '@/lib/insurance';
import { splitAlreadyListed, splitOverThreshold, type BlacklistKey } from '@/lib/blacklist';
import { withinDays, toBlacklistKeys, type PastRecord } from '@/lib/historyLookup';

/**
 * 파일을 올렸을 때 블랙리스트로 빠지는 조건.
 *
 * 판정 함수 하나가 아니라 classify/deploy가 실제로 엮는 순서를 그대로 재현한다.
 * 순서가 어긋나면 함수는 다 맞는데 화면 건수만 틀리는 일이 생기고, 그건
 * 단위 테스트로는 안 잡힌다.
 *
 *   ① 주문번호 중복 제거 → ② 명단 대조 → ③ 60일 3회 → (④ 30일 중복 → 배정)
 */

const now = new Date(2026, 7, 25, 10, 0);

const daysAgo = (n: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
};

const 상품 = '동양생명 치매간병보험';

/** 이번에 올린 파일의 한 줄 */
const row = (o: Record<string, any> = {}) => ({
  주문번호: `주문-${Math.random()}`,
  상품명: 상품,
  고객명: '김철수',
  Tel1: '010-1111-1111',
  Tel2: '010-1111-1111',
  생년월일성별: '5801011******',
  ...o,
});

/** 과거 60일 안에 올라온 한 줄 */
const past = (o: Partial<PastRecord> = {}): PastRecord => ({
  uploadedAt: daysAgo(10),
  dupReason: '',
  assignedTo: '파라인슈1',
  assignedAt: null,
  receivedAt: null,
  fileId: 'past-file',
  fileName: '과거.xlsx',
  name: '김철수',
  tel1: '010-1111-1111',
  tel2: '010-1111-1111',
  birth: '5801011******',
  product: 상품,
  ...o,
});

/** classify/deploy가 쓰는 것과 같은 키 추출 */
const toBlKey = (entry: { row: Record<string, any> }) => ({
  product: String(entry.row['상품명'] ?? ''),
  birth: normalizeBirth(String(entry.row['생년월일성별'] ?? '')),
  tel1: String(entry.row['Tel1'] ?? ''),
  tel2: String(entry.row['Tel2'] ?? ''),
});

/** 업로드 한 번. 라우트가 엮는 순서 그대로다. */
const upload = (
  rows: Record<string, any>[],
  listed: BlacklistKey[] = [],
  history: PastRecord[] = []
) => {
  const indexed = rows.map((r, i) => ({ row: r, sourceRow: i + 2 }));

  const { items: dedupedByOrder } = dedupeByOrderNumber(indexed, (e) => e.row['주문번호']);

  const { items: notListed, registered } = splitAlreadyListed(dedupedByOrder, toBlKey, listed);

  const { items, newlyHit } = splitOverThreshold(
    notListed,
    toBlKey,
    toBlacklistKeys(withinDays(history, now, BLACKLIST_DAYS))
  );

  return { assignable: items, registered, newlyHit };
};

describe('60일 내 3회 — 오늘 건까지 합쳐서 센다', () => {
  it('과거 2건 + 오늘 1건 = 3회 → 빠진다', () => {
    const r = upload([row()], [], [past(), past()]);

    expect(r.newlyHit).toHaveLength(1);
    expect(r.newlyHit[0].count).toBe(3);
    expect(r.assignable).toHaveLength(0);
  });

  it('과거 1건 + 오늘 1건 = 2회 → 배정된다', () => {
    const r = upload([row()], [], [past()]);

    expect(r.newlyHit).toHaveLength(0);
    expect(r.assignable).toHaveLength(1);
  });

  it('과거가 없으면 배정된다', () => {
    expect(upload([row()]).assignable).toHaveLength(1);
  });
});

/**
 * 기간은 날짜 단위로 자른다. "60일 × 24시간"으로 재면 같은 날에 올린 건이
 * 배포 시각에 따라 갈려, 아침에 올릴 때와 오후에 올릴 때 건수가 어긋난다.
 */
describe('60일 경계', () => {
  it('60일째 건은 센다', () => {
    const r = upload([row()], [], [past({ uploadedAt: daysAgo(60) }), past()]);

    expect(r.newlyHit).toHaveLength(1);
    expect(r.newlyHit[0].count).toBe(3);
  });

  it('61일 전 건은 세지 않는다 — 2회로 남아 배정된다', () => {
    const r = upload([row()], [], [past({ uploadedAt: daysAgo(61) }), past()]);

    expect(r.newlyHit).toHaveLength(0);
    expect(r.assignable).toHaveLength(1);
  });
});

/**
 * 무엇을 '신청 1회'로 볼 것인가. 과대 집계는 곧 멀쩡한 사람의 영구 차단이다.
 */
describe('과거 기록 중 무엇을 세는가', () => {
  it('주문번호 중복으로 빠진 과거 건은 세지 않는다 — 같은 줄이 두 번 들어간 것', () => {
    const r = upload([row()], [], [past({ dupReason: DUP_ORDER_REASON }), past()]);

    expect(r.newlyHit).toHaveLength(0);
    expect(r.assignable).toHaveLength(1);
  });

  it('30일 중복으로 빠진 과거 건은 센다 — 신청은 있었던 일이다', () => {
    const r = upload([row()], [], [past({ dupReason: DUP_CUSTOMER_REASON }), past()]);

    expect(r.newlyHit).toHaveLength(1);
    expect(r.newlyHit[0].count).toBe(3);
  });
});

describe('이번 파일 안에서 세는 방법', () => {
  it('같은 주문번호 세 줄은 1회다 — 주문번호 중복을 먼저 걷어낸다', () => {
    const 같은주문 = { 주문번호: 'A-1' };
    const r = upload([row(같은주문), row(같은주문), row(같은주문)]);

    expect(r.newlyHit).toHaveLength(0);
    expect(r.assignable).toHaveLength(1);
  });

  it('주문번호가 다른 세 줄은 3회다 — 오늘만 3번이어도 막힌다', () => {
    const r = upload([row(), row(), row()]);

    expect(r.newlyHit).toHaveLength(3);
    expect(r.assignable).toHaveLength(0);
  });
});

/**
 * 같은 사람을 가리는 기준은 전화번호다. 이름과 생년월일은 보지 않는다 —
 * 이름은 오타로, 생년월일은 표기가 제각각이라 조건에 넣으면 같은 사람을 놓친다.
 */
describe('누구를 같은 사람으로 보는가', () => {
  it('이름과 생년월일이 달라도 번호가 겹치면 같은 사람', () => {
    const r = upload(
      [row({ 고객명: '김 철 수', 생년월일성별: '1958-01-01' })],
      [],
      [past(), past({ name: '김철슈', birth: '580101' })]
    );

    expect(r.newlyHit).toHaveLength(1);
    expect(r.newlyHit[0].count).toBe(3);
  });

  it('Tel1과 Tel2가 뒤바뀌어도 같은 사람', () => {
    const 과거 = past({ tel1: '010-9999-9999', tel2: '010-1111-1111' });
    const r = upload([row({ Tel1: '010-1111-1111', Tel2: '010-7777-7777' })], [], [과거, 과거]);

    expect(r.newlyHit).toHaveLength(1);
  });

  it('번호가 하나도 안 겹치면 다른 사람 — 따로 센다', () => {
    const 남 = past({ tel1: '010-8888-8888', tel2: '010-8888-8888' });
    const r = upload([row()], [], [남, 남]);

    expect(r.newlyHit).toHaveLength(0);
    expect(r.assignable).toHaveLength(1);
  });

  it('상품이 다르면 따로 센다 — 한 사람이 여러 상품에 가입할 수 있다', () => {
    const r = upload([row()], [], [past({ product: '동양생명 암보험' }), past()]);

    expect(r.newlyHit).toHaveLength(0);
    expect(r.assignable).toHaveLength(1);
  });

  it('번호가 없으면 몇 번이든 판정하지 않는다 — 근거 없이 영구 차단하지 않는다', () => {
    const 무번호 = row({ Tel1: '', Tel2: '' });
    const r = upload([무번호], [], [past(), past(), past()]);

    expect(r.newlyHit).toHaveLength(0);
    expect(r.assignable).toHaveLength(1);
  });
});

/** 이게 이 기능의 핵심이다. 한 번 오르면 기간이 지나도 안 풀린다. */
describe('이미 명단에 오른 사람', () => {
  const 명단 = (o: Partial<BlacklistKey> = {}): BlacklistKey => ({
    product: 상품,
    birth: '5801011',
    tel1: '010-1111-1111',
    tel2: '010-1111-1111',
    ...o,
  });

  it('최근 신청이 하나도 없어도 막힌다', () => {
    const r = upload([row()], [명단()], []);

    expect(r.registered).toHaveLength(1);
    expect(r.assignable).toHaveLength(0);
  });

  it('3회에 못 미쳐도 막힌다 — 명단이 먼저다', () => {
    const r = upload([row()], [명단()], [past()]);

    expect(r.registered).toHaveLength(1);
    expect(r.newlyHit).toHaveLength(0);
  });

  it('사유가 갈린다 — 이미 오른 것과 이번에 걸린 것', () => {
    const 오른사람 = row();
    const 새로걸린사람 = row({ Tel1: '010-2222-2222', Tel2: '010-2222-2222' });
    const 과거 = past({ tel1: '010-2222-2222', tel2: '010-2222-2222' });

    const r = upload([오른사람, 새로걸린사람], [명단()], [과거, 과거]);

    expect(r.registered.map((e) => e.row)).toEqual([오른사람]);
    expect(r.newlyHit.map((h) => h.item.row)).toEqual([새로걸린사람]);
    expect(r.assignable).toHaveLength(0);
  });

  /** 관리자가 손으로 올린 명단은 상품이 없다 — "어느 상품으로 와도 막아라" */
  it('수동 등록은 상품이 달라도 막는다', () => {
    const r = upload([row({ 상품명: '흥국생명 암보험' })], [명단({ product: '' })], []);

    expect(r.registered).toHaveLength(1);
    expect(r.assignable).toHaveLength(0);
  });

  it('수동 등록도 번호가 안 겹치면 안 막는다', () => {
    const 다른번호 = 명단({ product: '', tel1: '010-8888-8888', tel2: '010-8888-8888' });

    expect(upload([row()], [다른번호], []).registered).toHaveLength(0);
  });
});
