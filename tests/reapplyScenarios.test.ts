import { describe, it, expect } from 'vitest';
import {
  dedupeByOrderNumber,
  normalizeBirth,
  BLACKLIST_DAYS,
  BLACKLIST_REASON_NEW,
  BLACKLIST_REASON_LISTED,
  DUP_CUSTOMER_REASON,
  DUP_CROSS_PHONE_REASON,
  HISTORY_DUP_DAYS,
} from '@/lib/insurance';
import { dedupeAgainstHistory } from '@/lib/historyDedupe';
import { splitAlreadyListed, splitOverThreshold, type BlacklistKey } from '@/lib/blacklist';
import { findLastAssignment, type AssignmentRecord } from '@/lib/lastAssignment';

/**
 * 배포를 여러 번 이어서 했을 때 한 고객이 어떻게 흘러가는가.
 *
 * 한 번의 배포만 봐서는 못 잡는 것들이 있다 — 지난번에 중복으로 빠진 행이
 * 이번 판정에서 어떻게 세어지는지, 알림이 어느 지사로 가는지는 앞선 배포가
 * 무엇을 남겼느냐에 달려 있다.
 *
 * 그래서 배포마다 원본 파일에 남는 값(배정소속·중복사유)까지 그대로 쌓아 두고
 * 다음 배포가 그걸 읽게 한다. 실제 동작과 같은 구조다.
 */

const 상품 = '동양생명 치매간병보험';
const 파라 = '파라인슈1';
const 한울 = '한울부원';

/** 파일 한 줄 */
interface Row {
  name: string;
  tel1: string;
  tel2: string;
  birth: string;
  order: string;
  /** 접수일자 — 고객이 실제로 신청한 날 */
  received: Date;
}

/** 배포가 원본 파일에 남기는 한 줄 */
interface PastRow extends AssignmentRecord {
  birth: string;
  product: string;
  dupReason: string;
}

const d = (month: number, day: number) => new Date(2026, month - 1, day);

const row = (o: Partial<Row> = {}): Row => ({
  name: '홍길동',
  tel1: '010-1111-2222',
  tel2: '010-1111-2222',
  birth: '8001011******',
  order: `주문-${Math.random()}`,
  received: d(8, 1),
  ...o,
});

const toBlKey = (r: Row): BlacklistKey => ({
  product: 상품,
  birth: normalizeBirth(r.birth),
  tel1: r.tel1,
  tel2: r.tel2,
});

const toDedupeKey = (r: Row) => ({ name: r.name, tel1: r.tel1, tel2: r.tel2, birth: r.birth });

const withinDays = (past: PastRow[], now: Date, days: number) => {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return past.filter((p) => (p.receivedAt ?? p.uploadedAt) >= since);
};

interface DeployResult {
  /** 지사로 나간 행 */
  assigned: Row[];
  /** 빠진 행과 그 사유 */
  excluded: Array<{ row: Row; reason: string }>;
  /** 만들어진 알림 */
  notices: Array<{ row: Row; reason: string; dept: string; previousAt: Date }>;
}

/**
 * 배포 한 번. 라우트가 엮는 순서를 그대로 따른다.
 *
 * @param past 앞선 배포들이 원본 파일에 남긴 행. 이 배열에 이번 결과가 덧붙는다
 */
function deploy(
  rows: Row[],
  past: PastRow[],
  listed: BlacklistKey[],
  deployedAt: Date,
  배정지사: string = 파라
): DeployResult {
  // ① 주문번호 중복
  const { items: afterOrder } = dedupeByOrderNumber(rows, (r) => r.order);

  // ② 이미 명단에 오른 사람
  const { items: notListed, registered } = splitAlreadyListed(afterOrder, toBlKey, listed);

  // ③ 60일 3회 — 주문번호 중복만 뺀 원천 기준
  const { items: notBlack, newlyHit } = splitOverThreshold(
    notListed,
    toBlKey,
    withinDays(past, deployedAt, BLACKLIST_DAYS)
      .filter((p) => p.dupReason !== '주문번호 중복')
      .map((p) => ({ product: p.product, birth: p.birth, tel1: p.tel1, tel2: p.tel2 }))
  );

  // ④ 30일 중복
  const { items: assigned, removedSamePhone, removedCrossPhone } = dedupeAgainstHistory(
    notBlack,
    toDedupeKey,
    withinDays(past, deployedAt, HISTORY_DUP_DAYS)
  );

  const excluded = [
    ...registered.map((row) => ({ row, reason: BLACKLIST_REASON_LISTED })),
    ...newlyHit.map(({ item, count }) => ({ row: item, reason: `${BLACKLIST_REASON_NEW} (${count}회)` })),
    ...removedSamePhone.map((row) => ({ row, reason: DUP_CUSTOMER_REASON })),
    ...removedCrossPhone.map((row) => ({ row, reason: DUP_CROSS_PHONE_REASON })),
  ] as Array<{ row: Row; reason: string }>;

  // 빠진 건마다 직전 배정을 찾아 알림을 만든다
  const notices: DeployResult['notices'] = [];
  for (const { row: r, reason } of excluded) {
    const last = findLastAssignment(
      { name: r.name, tel1: r.tel1, tel2: r.tel2, assignedTo: '', receivedAt: r.received, uploadedAt: deployedAt },
      past
    );
    if (last) notices.push({ row: r, reason, dept: last.dept, previousAt: last.at });
  }

  // 이번 배포가 원본 파일에 남기는 값. 다음 배포가 이걸 읽는다.
  const toPast = (r: Row, assignedTo: string, dupReason: string): PastRow => ({
    name: r.name,
    tel1: r.tel1,
    tel2: r.tel2,
    birth: r.birth,
    product: 상품,
    assignedTo,
    dupReason,
    receivedAt: r.received,
    uploadedAt: deployedAt,
  });

  past.push(...assigned.map((r) => toPast(r, 배정지사, '')));
  past.push(
    ...excluded.map(({ row: r, reason }) =>
      toPast(r, reason.includes('블랙리스트') || reason.includes('3회') ? '블랙리스트' : '중복 제외', reason)
    )
  );

  return { assigned, excluded, notices };
}

describe('시나리오 · 8/01 신청 → 8/05 재신청 → 8/26 또 신청', () => {
  const past: PastRow[] = [];
  const listed: BlacklistKey[] = [];

  const 첫신청 = deploy([row({ received: d(8, 1), order: 'A' })], past, listed, d(8, 1));
  const 둘째 = deploy([row({ received: d(8, 5), order: 'B' })], past, listed, d(8, 5));
  const 셋째 = deploy([row({ received: d(8, 26), order: 'C' })], past, listed, d(8, 26));

  it('8/01 — 처음이라 그냥 배정된다', () => {
    expect(첫신청.assigned).toHaveLength(1);
    expect(첫신청.notices).toHaveLength(0);
  });

  it('8/05 — 30일 중복으로 빠진다', () => {
    expect(둘째.assigned).toHaveLength(0);
    expect(둘째.excluded[0].reason).toBe(DUP_CUSTOMER_REASON);
  });

  it('8/05 — 8/01에 받았던 지사에 알림이 간다', () => {
    expect(둘째.notices).toHaveLength(1);
    expect(둘째.notices[0].dept).toBe(파라);
    expect(둘째.notices[0].previousAt).toEqual(d(8, 1));
  });

  /**
   * 여기가 이 시나리오의 핵심이다. 8/26은 세 번째 신청이라 30일 중복보다
   * 60일 3회가 먼저 걸린다 — 판정 순서가 ③ 3회 → ④ 30일 중복이기 때문이다.
   */
  it('8/26 — 3회째라 중복이 아니라 블랙리스트로 빠진다', () => {
    expect(셋째.assigned).toHaveLength(0);
    expect(셋째.excluded[0].reason).toContain(BLACKLIST_REASON_NEW);
    expect(셋째.excluded[0].reason).toContain('3회');
  });

  /**
   * 8/05은 자기도 '중복 제외'라 알려줄 지사가 없다. 그 앞의 8/01을 찾아야 한다.
   */
  it('8/26 — 알림은 8/05이 아니라 8/01을 가리킨다', () => {
    expect(셋째.notices).toHaveLength(1);
    expect(셋째.notices[0].previousAt).toEqual(d(8, 1));
    expect(셋째.notices[0].dept).toBe(파라);
  });

  it('결국 지사는 알림 두 건을 받는다 — 8/05분과 8/26분', () => {
    const 전체 = [...첫신청.notices, ...둘째.notices, ...셋째.notices];
    expect(전체).toHaveLength(2);
    expect(전체.map((n) => n.row.received)).toEqual([d(8, 5), d(8, 26)]);
  });
});

describe('예외 · 같은 날 두 번 들어온 신청', () => {
  it('같은 날짜면 알림을 안 만든다 — 같은 신청서가 두 번 들어온 것이다', () => {
    const past: PastRow[] = [];
    deploy([row({ received: d(8, 1), order: 'A' })], past, [], d(8, 1));
    const 두번째 = deploy([row({ received: d(8, 1), order: 'B' })], past, [], d(8, 1));

    expect(두번째.excluded).toHaveLength(1);
    expect(두번째.notices).toHaveLength(0);
  });
});

describe('예외 · 배정된 적이 없는 사람', () => {
  it('처음부터 중복으로 빠지면 알릴 지사가 없다', () => {
    const past: PastRow[] = [];
    // 첫 배포부터 중복으로 빠지게 — 과거에 중복 제외 기록만 심어 둔다
    past.push({
      name: '홍길동',
      tel1: '010-1111-2222',
      tel2: '010-1111-2222',
      birth: '8001011******',
      product: 상품,
      assignedTo: '중복 제외',
      dupReason: DUP_CUSTOMER_REASON,
      receivedAt: d(8, 1),
      uploadedAt: d(8, 1),
    });

    const 결과 = deploy([row({ received: d(8, 10), order: 'A' })], past, [], d(8, 10));

    expect(결과.excluded).toHaveLength(1);
    expect(결과.notices).toHaveLength(0);
  });
});

describe('예외 · 30일이 지나면 중복이 아니다', () => {
  it('31일 뒤 신청은 그냥 배정된다 — 알림도 없다', () => {
    const past: PastRow[] = [];
    deploy([row({ received: d(7, 1), order: 'A' })], past, [], d(7, 1));

    const 결과 = deploy([row({ received: d(8, 5), order: 'B' })], past, [], d(8, 5));

    expect(결과.assigned).toHaveLength(1);
    expect(결과.notices).toHaveLength(0);
  });
});

describe('예외 · 지사를 옮겨 다닌 고객', () => {
  /**
   * 두 번 다 배정되려면 30일 넘게 벌어져야 한다. 그 안에 들어오면 두 번째가
   * 중복으로 빠져서 애초에 배정 기록이 하나뿐이다.
   */
  it('가장 최근에 받았던 지사에 알린다', () => {
    const past: PastRow[] = [];
    const 첫 = deploy([row({ received: d(6, 1), order: 'A' })], past, [], d(6, 1), 한울);
    const 둘 = deploy([row({ received: d(7, 10), order: 'B' })], past, [], d(7, 10), 파라);

    // 둘 다 실제로 배정됐는지 먼저 확인한다. 아니면 아래 기대값이 의미 없다.
    expect(첫.assigned).toHaveLength(1);
    expect(둘.assigned).toHaveLength(1);

    const 결과 = deploy([row({ received: d(7, 20), order: 'C' })], past, [], d(7, 20));

    expect(결과.excluded).toHaveLength(1);
    expect(결과.notices).toHaveLength(1);
    expect(결과.notices[0].dept).toBe(파라);
    expect(결과.notices[0].previousAt).toEqual(d(7, 10));
  });
});

describe('예외 · 이미 명단에 오른 사람이 또 신청', () => {
  it('블랙리스트 사유로 알림이 간다', () => {
    const past: PastRow[] = [];
    deploy([row({ received: d(8, 1), order: 'A' })], past, [], d(8, 1));

    const 명단 = [toBlKey(row())];
    const 결과 = deploy([row({ received: d(8, 20), order: 'B' })], past, 명단, d(8, 20));

    expect(결과.excluded[0].reason).toBe(BLACKLIST_REASON_LISTED);
    expect(결과.notices).toHaveLength(1);
    expect(결과.notices[0].dept).toBe(파라);
  });
});
