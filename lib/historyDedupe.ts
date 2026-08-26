/**
 * 과거 업로드분과 비교하는 중복 판정.
 *
 * 파일 안에서만 보는 중복(주문번호)과 달리, 이건 지난 30일치 업로드를 뒤져
 * "이 사람 최근에 이미 들어왔었다"를 잡는다. 같은 고객에게 두 번 연락이 가는 걸
 * 막으려는 것이다.
 *
 * 판정을 두 갈래로 나눈다. 전화번호 두 칸이 같은 행과 다른 행은 성격이 다르다.
 *
 *   Tel1 == Tel2  →  이름 + 전화번호  (확실한 건. 비교할 번호가 하나뿐이다)
 *   Tel1 != Tel2  →  이름 + 생년월일 + 번호 겹침
 *
 * 두 번째 갈래가 필요한 이유: 같은 사람이 번호를 어느 칸에 넣느냐에 따라
 * 값이 어긋난다. Tel2끼리만 비교하면 아래를 못 잡는다.
 *
 *   신청1  홍길동 / Tel1 1111 / Tel2 2222
 *   신청2  홍길동 / Tel1 2222 / Tel2 1111   → Tel2끼리는 2222 ≠ 1111
 *
 * 번호를 묶음으로 보고 하나라도 겹치면 같은 사람으로 보되, 생년월일까지 같아야
 * 한다는 조건을 건다. 번호만 겹치는 걸로 지우면 대표번호를 공유하는 동명이인이
 * 딸려 들어간다. 한 번 지우면 되짚을 수 없다.
 */

import { normalizePhone } from '@/lib/insurance';

/** 비교에 쓰는 값만 뽑은 형태. 과거 기록도 새 행도 이 모양으로 맞춰서 다룬다. */
export interface DedupeKey {
  name: string;
  tel1: string;
  tel2: string;
  birth: string;
}

/** 어느 갈래로 걸렸는지. 중복 시트의 사유 열에 그대로 적는다. */
export type HistoryDupKind = 'samePhone' | 'crossPhone';

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const text = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * 전화번호 두 칸 중 빈 곳을 있는 값으로 채운다.
 *
 * 한 칸이 비어 있으면 "번호가 다르다"로 잘못 갈라져 엉뚱한 갈래로 간다.
 * 둘 다 비면 채울 게 없으므로 그대로 둔다 — 그런 행은 아래에서 판정하지 않는다.
 */
export function fillPhones(key: DedupeKey): DedupeKey {
  const t1 = normalizePhone(key.tel1);
  const t2 = normalizePhone(key.tel2);
  return { ...key, tel1: t1 || t2, tel2: t2 || t1 };
}

/** 이 행을 어느 갈래로 볼지. 번호를 채운 뒤에 판단해야 한다. */
export function phoneShape(key: DedupeKey): HistoryDupKind {
  const filled = fillPhones(key);
  return filled.tel1 === filled.tel2 ? 'samePhone' : 'crossPhone';
}

/** 이름 + 전화번호. Tel1과 Tel2가 같은 행에 쓴다. */
function samePhoneKey(key: DedupeKey): string | null {
  const filled = fillPhones(key);
  const name = text(filled.name);
  if (!name || !filled.tel2) return null;
  return `${name}|${filled.tel2}`;
}

/**
 * 이름 + 생년월일이 같고 번호가 하나라도 겹치는가.
 *
 * 번호는 묶음으로 본다 — 어느 칸에 넣었는지는 상관없다.
 * 셋 중 하나라도 비면 같은 사람인지 판단할 근거가 없으므로 아니라고 본다.
 */
function crossPhoneMatch(a: DedupeKey, b: DedupeKey): boolean {
  const x = fillPhones(a);
  const y = fillPhones(b);

  const name = text(x.name);
  const birth = text(x.birth);
  if (!name || !birth) return false;
  if (name !== text(y.name) || birth !== text(y.birth)) return false;

  const mine = new Set([x.tel1, x.tel2].filter(Boolean));
  return [y.tel1, y.tel2].some((t) => t && mine.has(t));
}

/**
 * 과거 기록과 대조해 중복을 갈라낸다.
 *
 * 두 갈래를 따로 돌려주는 이유는 시트를 나눠 담기 위해서다. 한 시트에 섞으면
 * "무엇 때문에 빠졌나"를 사유 열로 일일이 짚어야 한다.
 *
 * @param items 이번에 올린 행들
 * @param toKey 행에서 비교값을 뽑는 함수
 * @param past  지난 30일치 과거 기록
 */
export function dedupeAgainstHistory<T>(
  items: T[],
  toKey: (item: T) => DedupeKey,
  past: DedupeKey[]
): { items: T[]; removedSamePhone: T[]; removedCrossPhone: T[] } {
  // 같은 번호 갈래는 키가 하나로 떨어지므로 집합으로 O(1) 비교한다.
  const pastSamePhone = new Set<string>();
  // 어긋난 번호 갈래는 겹침을 봐야 해서 이름+생년월일로 먼저 좁힌 뒤 훑는다.
  const pastByIdentity = new Map<string, DedupeKey[]>();

  for (const record of past) {
    const filled = fillPhones(record);

    const sameKey = samePhoneKey(filled);
    if (sameKey) pastSamePhone.add(sameKey);

    const name = text(filled.name);
    const birth = text(filled.birth);
    if (name && birth) {
      const id = `${name}|${birth}`;
      const bucket = pastByIdentity.get(id);
      if (bucket) bucket.push(filled);
      else pastByIdentity.set(id, [filled]);
    }
  }

  const kept: T[] = [];
  const removedSamePhone: T[] = [];
  const removedCrossPhone: T[] = [];

  for (const item of items) {
    const key = fillPhones(toKey(item));

    if (phoneShape(key) === 'samePhone') {
      const k = samePhoneKey(key);
      if (k && pastSamePhone.has(k)) {
        removedSamePhone.push(item);
        continue;
      }
      kept.push(item);
      continue;
    }

    const id = `${text(key.name)}|${text(key.birth)}`;
    const candidates = pastByIdentity.get(id) ?? [];
    if (candidates.some((c) => crossPhoneMatch(key, c))) {
      removedCrossPhone.push(item);
      continue;
    }
    kept.push(item);
  }

  return { items: kept, removedSamePhone, removedCrossPhone };
}
