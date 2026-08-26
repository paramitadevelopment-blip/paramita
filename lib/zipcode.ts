/**
 * 우편번호로 주소를 되찾는다.
 *
 * 지역 배정은 주소 첫 단어로 한다. 그런데 거래처가 '경냄', '부싼'처럼 오타를
 * 보내면 어느 시·도인지 못 읽어 전부 '이외지역'으로 빠진다. 사람이 일일이
 * 고쳐야 하는데, 우편번호는 대개 멀쩡하므로 그걸로 정식 주소를 받아온다.
 *
 * 우정사업본부 '새주소 5자리 우편번호 조회 서비스'를 쓴다.
 */

/** 명세서의 호출 URL. https는 빈 응답이 와서 http만 동작한다. */
const ENDPOINT =
  'http://openapi.epost.go.kr/postal/retrieveNewAdressAreaCdService' +
  '/retrieveNewAdressAreaCdService/getNewAddressListAreaCd';

/**
 * 요청 URL을 만든다.
 *
 * ServiceKey는 이미 URL 인코딩된 값이다(끝의 %3D%3D 가 ==). 그래서
 * encodeURIComponent나 URLSearchParams를 쓰면 %가 %25로 또 바뀌어 인증이 깨진다.
 * 키는 그대로 이어 붙이고, 검색어만 인코딩한다.
 */
export function buildZipLookupUrl(serviceKey: string, zip: string): string {
  return (
    `${ENDPOINT}?ServiceKey=${serviceKey}` +
    `&searchSe=post&srchwrd=${encodeURIComponent(zip)}&countPerPage=1`
  );
}

/**
 * 응답 XML에서 도로명주소를 꺼낸다. 못 읽으면 null이다.
 *
 * 정규식으로 읽는다 — 필요한 건 값 하나뿐이라 XML 파서를 들일 이유가 없다.
 * successYN이 N이거나 결과가 없으면 null을 준다. 빈 문자열을 주면 부르는 쪽에서
 * "주소를 못 찾았다"와 "빈 주소를 찾았다"를 구분할 수 없다.
 */
export function parseZipLookupResponse(xml: string): string | null {
  if (!xml) return null;

  const success = xml.match(/<successYN>\s*([^<]*)\s*<\/successYN>/)?.[1]?.trim();
  if (success && success.toUpperCase() !== 'Y') return null;

  const address = xml.match(/<lnmAdres>([^<]*)<\/lnmAdres>/)?.[1]?.trim();
  return address || null;
}

/** 우편번호로 쓸 수 있는 값인가. 5자리 숫자만 받는다. */
export function normalizeZip(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 5 ? digits : null;
}

/**
 * 우편번호 → 주소 캐시.
 *
 * 같은 파일 안에 같은 우편번호가 여러 번 나오고, 파일이 바뀌어도 다시 나온다.
 * 우편번호와 주소의 짝은 거의 안 바뀌므로 한 번 받아오면 계속 쓴다.
 * 못 찾은 것도 담는다 — 안 담으면 없는 우편번호를 볼 때마다 다시 부른다.
 *
 * 프로세스가 살아 있는 동안만 유지된다. 전국 우편번호가 3만여 개라 다 담겨도
 * 몇 MB지만, 한도를 둬서 예상 못 한 입력으로 무한정 늘지 않게 한다.
 */
const MAX_CACHE = 20000;
const cache = new Map<string, string | null>();

/** 테스트에서 상태를 초기화할 때 쓴다. */
export function clearZipCache(): void {
  cache.clear();
}

export function getZipCacheSize(): number {
  return cache.size;
}

function remember(zip: string, address: string | null): void {
  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(zip, address);
}

/** 통신 부분만 갈아끼울 수 있게 받는다. 테스트에서 실제로 부르지 않기 위함이다. */
export type FetchLike = (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>;

/**
 * 우편번호 여러 개를 한 번에 주소로 바꾼다.
 *
 * 실패는 조용히 넘긴다 — 외부 API가 죽었다고 배포 전체가 멈추면 안 된다.
 * 못 찾은 건은 지금처럼 '이외지역'으로 간다.
 *
 * @param serviceKey  .env의 ZIPCODE_API_KEY
 * @param zips        찾을 우편번호들 (중복은 알아서 접는다)
 * @param fetchImpl   통신 함수. 기본은 전역 fetch
 */
export async function lookupZips(
  serviceKey: string,
  zips: string[],
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!serviceKey) return found;

  const todo: string[] = [];
  for (const raw of zips) {
    const zip = normalizeZip(raw);
    if (!zip) continue;
    if (cache.has(zip)) {
      const hit = cache.get(zip);
      if (hit) found.set(zip, hit);
      continue;
    }
    if (!todo.includes(zip)) todo.push(zip);
  }

  for (const zip of todo) {
    try {
      const res = await fetchImpl(buildZipLookupUrl(serviceKey, zip));
      const address = res.ok ? parseZipLookupResponse(await res.text()) : null;
      remember(zip, address);
      if (address) found.set(zip, address);
    } catch {
      // 한 건이 실패해도 나머지는 계속 찾는다.
      remember(zip, null);
    }
  }

  return found;
}
