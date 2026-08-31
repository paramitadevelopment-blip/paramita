import {
  normalizeProductName,
  normalizePhone,
  BLACKLIST_THRESHOLD,
} from '@/lib/insurance';

/**
 * 블랙리스트 판정.
 *
 * 짧은 기간에 여러 번 신청한 사람은 지사에 넘기지 않는다. 이미 여러 번 연락이
 * 갔거나 실적으로 이어지지 않는 건이라서다.
 *
 * 같은 사람인지는 **전화번호**로 본다. Tel1·Tel2를 묶음으로 보고 하나라도
 * 겹치면 같은 사람으로 친다 — 같은 사람이 번호를 어느 칸에 넣느냐에 따라
 * 값이 어긋나기 때문이다 (중복3과 같은 이유).
 *
 * 이름과 생년월일은 보지 않는다. 이름은 오타·띄어쓰기로 흔들리고, 생년월일은
 * 파일마다 표기가 제각각이라 조건에 넣으면 같은 사람을 놓친다. 번호가 이 사람을
 * 가리는 값이다.
 *
 * 상품은 사람을 가리는 값이 아니라 세는 단위다. 한 사람이 여러 상품에 가입할 수
 * 있으므로 3회 판정은 상품별로 따로 센다. 다만 관리자가 손으로 올린 명단은
 * 상품이 없다 — "어느 상품으로 와도 막아라"는 뜻이라 번호만 본다.
 *
 * 번호가 없으면 판정하지 않는다. 근거 없이 영구 차단하지 않는다.
 */
export interface BlacklistKey {
  product: string;
  birth: string;
  tel1: string;
  tel2: string;
}

/** 세는 단위. 상품별로 따로 세므로 이걸로 후보를 좁힌 뒤 번호를 본다. */
function identityOf(key: BlacklistKey): string | null {
  const product = normalizeProductName(key.product);
  if (!product) return null;
  return product;
}

/** 이 사람의 전화번호 묶음. 비어 있으면 판정하지 않는다. */
function phonesOf(key: BlacklistKey): string[] {
  const phones = [normalizePhone(key.tel1), normalizePhone(key.tel2)].filter(Boolean);
  return Array.from(new Set(phones));
}

/** 판정에 쓸 수 있는 값인가. 셀 단위(상품)와 사람(번호)이 다 있어야 한다. */
export function isJudgeable(key: BlacklistKey): boolean {
  return identityOf(key) !== null && phonesOf(key).length > 0;
}

/** 같은 상품이고 번호가 하나라도 겹치는가 */
export function isSamePerson(a: BlacklistKey, b: BlacklistKey): boolean {
  const idA = identityOf(a);
  const idB = identityOf(b);
  if (!idA || !idB || idA !== idB) return false;

  const mine = new Set(phonesOf(a));
  if (mine.size === 0) return false;
  return phonesOf(b).some((p) => mine.has(p));
}

/**
 * 상품을 빼고 번호만 본다.
 *
 * 관리자가 손으로 올린 명단은 상품을 받지 않는다. "이 사람은 어느 상품으로 와도
 * 막아라"는 뜻이라 상품을 조건에 넣으면 아무것도 안 걸린다.
 */
function isSamePersonIgnoringProduct(a: BlacklistKey, b: BlacklistKey): boolean {
  const mine = new Set(phonesOf(a));
  if (mine.size === 0) return false;
  return phonesOf(b).some((p) => mine.has(p));
}

/**
 * 명단에서 이 사람에 해당하는 줄을 찾는다.
 *
 * `splitAlreadyListed`가 "막을까"를 정한다면 이건 "누구로 막았나"를 돌려준다.
 * 신청 건을 그 사람 밑에 달아 두려면 어느 줄에 걸렸는지 알아야 한다.
 * 판정은 같은 기준을 쓴다 — 여기서만 다르면 막힌 줄과 기록되는 줄이 갈린다.
 */
export function findListed<L extends BlacklistKey>(
  key: BlacklistKey,
  listed: L[]
): L | null {
  if (!isJudgeable(key)) return null;

  for (const entry of listed) {
    // 상품이 있는 줄은 배포가 올린 것, 없는 줄은 관리자가 손으로 올린 것이다.
    // 후자는 "어느 상품으로 와도 막아라"라서 번호만 본다.
    const matched = normalizeProductName(entry.product)
      ? isSamePerson(key, entry)
      : isSamePersonIgnoringProduct(key, entry);

    if (matched) return entry;
  }

  return null;
}

/** 상품+생년월일로 묶어둔 후보 목록. 번호 겹침은 이 안에서만 훑으면 된다. */
function bucketize(keys: BlacklistKey[]): Map<string, BlacklistKey[]> {
  const map = new Map<string, BlacklistKey[]>();
  for (const key of keys) {
    const id = identityOf(key);
    if (!id || phonesOf(key).length === 0) continue;
    const bucket = map.get(id);
    if (bucket) bucket.push(key);
    else map.set(id, [key]);
  }
  return map;
}

function countMatches(bucket: Map<string, BlacklistKey[]>, key: BlacklistKey): number {
  const id = identityOf(key);
  if (!id) return 0;
  return (bucket.get(id) ?? []).filter((c) => isSamePerson(key, c)).length;
}

/**
 * 이미 명단에 오른 사람을 갈라낸다.
 *
 * **중복 제거보다 먼저 부른다.** 명단 판정은 중복과 아무 상관이 없는데,
 * 중복을 먼저 걸러내면 명단에 오른 사람이 '중복'으로 분류되어 사유가 틀리게
 * 남는다. 관리자가 블랙리스트 시트를 열었을 때 그 사람이 없어 헷갈린다.
 *
 * @param listed 명단 (기간 무관, 영구)
 */
export function splitAlreadyListed<T>(
  items: T[],
  toKey: (item: T) => BlacklistKey,
  listed: BlacklistKey[]
): { items: T[]; registered: T[] } {
  // 명단은 두 갈래다. 배포가 올린 줄은 상품이 있고, 관리자가 손으로 올린 줄은
  // 상품이 없다. 상품 없는 줄은 identityOf가 null이라 그냥 두면 판정에서
  // 통째로 빠져, 수동 등록이 아무 효력이 없다.
  const scoped: BlacklistKey[] = [];
  const anyProduct: BlacklistKey[] = [];

  for (const key of listed) {
    if (normalizeProductName(key.product)) scoped.push(key);
    else anyProduct.push(key);
  }

  const listedBucket = bucketize(scoped);

  // 상품 없는 줄은 번호만 보면 되므로 번호를 통째로 모아 둔다.
  const anyProductPhones = new Set<string>();
  for (const key of anyProduct) {
    for (const phone of phonesOf(key)) anyProductPhones.add(phone);
  }

  const kept: T[] = [];
  const registered: T[] = [];

  for (const item of items) {
    const key = toKey(item);
    // 판정할 근거가 없으면 그대로 보낸다.
    if (!isJudgeable(key)) {
      kept.push(item);
      continue;
    }

    if (countMatches(listedBucket, key) > 0) {
      registered.push(item);
      continue;
    }

    if (phonesOf(key).some((phone) => anyProductPhones.has(phone))) {
      registered.push(item);
      continue;
    }

    kept.push(item);
  }

  return { items: kept, registered };
}

/**
 * 60일 안에 3회 이상 신청한 사람을 갈라낸다.
 *
 * **중복 제거를 마친 뒤에 부른다.** 같은 건이 두 번 들어온 것을 2회 신청으로
 * 세면 안 된다. 과대 집계는 곧 멀쩡한 사람의 영구 차단으로 이어진다.
 *
 * @param recent    최근 60일 신청 기록 (중복 포함 여부는 부르는 쪽 책임)
 * @param threshold 몇 회부터 막을지. 기본 3
 * @returns newlyHit 이번에 걸린 행. 배포 때 명단에 올린다
 */
export function splitOverThreshold<T>(
  items: T[],
  toKey: (item: T) => BlacklistKey,
  recent: BlacklistKey[],
  threshold: number = BLACKLIST_THRESHOLD
): { items: T[]; newlyHit: Array<{ item: T; count: number }> } {
  const recentBucket = bucketize(recent);

  // 이번 파일 안에서 같은 사람이 여러 번 나오면 그것도 신청 횟수다.
  // 과거 2번 + 오늘 1번이면 3번이고, 오늘만 3번이어도 3번이다.
  const todayKeys = items.map(toKey);
  const todayBucket = bucketize(todayKeys);

  const kept: T[] = [];
  const newlyHit: Array<{ item: T; count: number }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = todayKeys[i];

    if (!isJudgeable(key)) {
      kept.push(item);
      continue;
    }

    const count = countMatches(recentBucket, key) + countMatches(todayBucket, key);
    if (count >= threshold) {
      newlyHit.push({ item, count });
      continue;
    }

    kept.push(item);
  }

  return { items: kept, newlyHit };
}
