import { isUnreadableAddress } from '@/lib/insurance';
import { lookupZips, normalizeZip, type FetchLike } from '@/lib/zipcode';

/**
 * 시·도를 못 읽는 주소를 우편번호로 되찾는다.
 *
 * 배정은 주소 첫 단어로 한다. '경냄', '부싼' 같은 오타나 빈 주소는 못 읽어
 * 전부 '이외지역'으로 빠지는데, 우편번호는 대개 멀쩡하므로 그걸로 정식 주소를
 * 받아온다.
 *
 * 읽히는 주소는 건드리지 않는다 — 멀쩡한 건까지 외부 API에 의존시킬 이유가 없고,
 * 호출 수만 늘어난다.
 *
 * 실패하면 원래 주소를 그대로 둔다. 그 건은 지금처럼 '이외지역'으로 간다 —
 * 외부 API가 죽었다고 배포 전체가 멈추면 안 된다.
 */
export interface AddressRow {
  address: unknown;
  zip: unknown;
}

/**
 * 행마다 '판정에 쓸 주소'를 돌려준다. 원본 주소는 바꾸지 않는다 —
 * 화면과 파일에는 사람이 올린 값이 그대로 남아야 대조할 수 있다.
 *
 * @returns 행 순서와 1:1로 맞춘 주소 배열
 */
export async function resolveAddresses(
  rows: AddressRow[],
  serviceKey: string,
  fetchImpl?: FetchLike
): Promise<unknown[]> {
  // 못 읽는 행만 모은다. 같은 우편번호는 lookupZips가 알아서 한 번만 부른다.
  const needZips: string[] = [];
  for (const row of rows) {
    if (!isUnreadableAddress(row.address)) continue;
    const zip = normalizeZip(row.zip);
    if (zip) needZips.push(zip);
  }

  if (needZips.length === 0) return rows.map((r) => r.address);

  const found = await lookupZips(serviceKey, needZips, fetchImpl);

  return rows.map((row) => {
    if (!isUnreadableAddress(row.address)) return row.address;
    const zip = normalizeZip(row.zip);
    if (!zip) return row.address;
    return found.get(zip) ?? row.address;
  });
}
