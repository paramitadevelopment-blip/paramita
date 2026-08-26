import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildZipLookupUrl,
  parseZipLookupResponse,
  normalizeZip,
  lookupZips,
  clearZipCache,
  getZipCacheSize,
} from '@/lib/zipcode';
import { isUnreadableAddress, assignByAddress } from '@/lib/insurance';

/**
 * 우편번호로 주소를 되찾는 부분.
 *
 * 여기가 틀리면 오타 난 주소가 계속 '이외지역'으로 빠지거나,
 * 더 나쁘게는 엉뚱한 지역으로 배정된다.
 */

// 실제 응답에서 뽑은 모양
const OK_XML = `<?xml version="1.0" encoding="utf-8" standalone="yes"?><NewAddressListResponse><cmmMsgHeader><successYN>Y</successYN><returnCode>00</returnCode><errMsg></errMsg><totalCount>21</totalCount></cmmMsgHeader><newAddressListAreaCd><zipNo>48058</zipNo><lnmAdres>부산광역시 해운대구 센텀4로 15 (우동, 센텀시티몰)</lnmAdres><rnAdres>부산광역시 해운대구 우동 1493</rnAdres></newAddressListAreaCd></NewAddressListResponse>`;

const FAIL_XML = `<NewAddressListResponse><cmmMsgHeader><successYN>N</successYN><returnCode>30</returnCode><errMsg>SERVICE KEY IS NOT REGISTERED</errMsg></cmmMsgHeader></NewAddressListResponse>`;

const EMPTY_XML = `<NewAddressListResponse><cmmMsgHeader><successYN>Y</successYN><returnCode>00</returnCode><totalCount>0</totalCount></cmmMsgHeader></NewAddressListResponse>`;

const KEY = 'abc123%2Fxyz%3D%3D';

beforeEach(() => clearZipCache());

describe('요청 URL 만들기', () => {
  it('인증키를 그대로 붙인다 — 다시 인코딩하면 인증이 깨진다', () => {
    const url = buildZipLookupUrl(KEY, '48058');
    expect(url).toContain('ServiceKey=' + KEY);
    expect(url).not.toContain('%253D');
    expect(url).not.toContain('%252F');
  });

  it('우편번호로 검색한다', () => {
    const url = buildZipLookupUrl(KEY, '48058');
    expect(url).toContain('searchSe=post');
    expect(url).toContain('srchwrd=48058');
  });

  it('한 건만 받는다 — 첫 결과의 시·도만 쓰면 된다', () => {
    expect(buildZipLookupUrl(KEY, '48058')).toContain('countPerPage=1');
  });
});

describe('응답 읽기', () => {
  it('도로명주소를 꺼낸다', () => {
    expect(parseZipLookupResponse(OK_XML)).toBe('부산광역시 해운대구 센텀4로 15 (우동, 센텀시티몰)');
  });

  it('successYN이 N이면 null', () => {
    expect(parseZipLookupResponse(FAIL_XML)).toBeNull();
  });

  it('결과가 없으면 null', () => {
    expect(parseZipLookupResponse(EMPTY_XML)).toBeNull();
  });

  it('빈 응답이나 깨진 값에도 터지지 않는다', () => {
    expect(parseZipLookupResponse('')).toBeNull();
    expect(parseZipLookupResponse('<html>error</html>')).toBeNull();
  });
});

describe('우편번호 정리', () => {
  it('5자리 숫자만 받는다', () => {
    expect(normalizeZip('48058')).toBe('48058');
    expect(normalizeZip(48058)).toBe('48058');
    expect(normalizeZip(' 48058 ')).toBe('48058');
  });

  it('자릿수가 안 맞으면 안 쓴다 — 엉뚱한 주소를 받아오면 잘못 배정된다', () => {
    expect(normalizeZip('123')).toBeNull();
    expect(normalizeZip('123456')).toBeNull();
    expect(normalizeZip('')).toBeNull();
    expect(normalizeZip(null)).toBeNull();
    expect(normalizeZip('없음')).toBeNull();
  });

  it('예전 6자리 표기(하이픈)는 숫자만 남겨 판단한다', () => {
    expect(normalizeZip('480-58')).toBe('48058');
  });
});

describe('조회와 캐시', () => {
  const fakeFetch = (xml: string, calls: string[]) => async (url: string) => {
    calls.push(url);
    return { ok: true, text: async () => xml };
  };

  it('찾은 주소를 돌려준다', async () => {
    const calls: string[] = [];
    const got = await lookupZips(KEY, ['48058'], fakeFetch(OK_XML, calls));
    expect(got.get('48058')).toContain('부산광역시');
  });

  it('같은 우편번호는 한 번만 부른다', async () => {
    const calls: string[] = [];
    await lookupZips(KEY, ['48058', '48058', '48058'], fakeFetch(OK_XML, calls));
    expect(calls).toHaveLength(1);
  });

  it('다음 호출에서도 캐시를 쓴다', async () => {
    const calls: string[] = [];
    await lookupZips(KEY, ['48058'], fakeFetch(OK_XML, calls));
    await lookupZips(KEY, ['48058'], fakeFetch(OK_XML, calls));
    expect(calls).toHaveLength(1);
    expect(getZipCacheSize()).toBe(1);
  });

  it('못 찾은 것도 기억한다 — 없는 번호를 볼 때마다 다시 부르면 안 된다', async () => {
    const calls: string[] = [];
    await lookupZips(KEY, ['99999'], fakeFetch(EMPTY_XML, calls));
    await lookupZips(KEY, ['99999'], fakeFetch(EMPTY_XML, calls));
    expect(calls).toHaveLength(1);
  });

  it('통신이 터져도 나머지를 계속 찾는다', async () => {
    let n = 0;
    const flaky = async (url: string) => {
      n += 1;
      if (n === 1) throw new Error('network');
      return { ok: true, text: async () => OK_XML };
    };
    const got = await lookupZips(KEY, ['11111', '48058'], flaky);
    expect(got.has('11111')).toBe(false);
    expect(got.get('48058')).toContain('부산광역시');
  });

  it('응답이 200이 아니면 못 찾은 것으로 둔다', async () => {
    const got = await lookupZips(KEY, ['48058'], async () => ({ ok: false, text: async () => '' }));
    expect(got.size).toBe(0);
  });

  it('키가 없으면 아예 부르지 않는다', async () => {
    const calls: string[] = [];
    const got = await lookupZips('', ['48058'], fakeFetch(OK_XML, calls));
    expect(calls).toHaveLength(0);
    expect(got.size).toBe(0);
  });

  it('쓸 수 없는 우편번호는 부르지 않는다', async () => {
    const calls: string[] = [];
    await lookupZips(KEY, ['', '123', null as any], fakeFetch(OK_XML, calls));
    expect(calls).toHaveLength(0);
  });
});

/**
 * 이 기능을 만든 이유. 오타 난 주소가 우편번호를 거쳐 제자리를 찾아야 한다.
 */
describe('오타 보정이 실제로 되는가', () => {
  it('경냄 → (우편번호) → 경상남도 → 한울부원', () => {
    expect(isUnreadableAddress('경냄 창원시 성산구')).toBe(true);
    const fixed = '경상남도 창원시 성산구';
    expect(isUnreadableAddress(fixed)).toBe(false);
    expect(assignByAddress(fixed)).toEqual({ kind: 'dept', dept: '한울부원' });
  });

  it('API가 주는 정식 명칭이 우리 규칙에 그대로 걸린다', () => {
    const 실제응답 = [
      ['부산광역시 해운대구', '한울부원'],
      ['경상남도 창원시', '한울부원'],
      ['전북특별자치도 전주시', '경기'],
      ['경상북도 안동시', '굿모닝제너럴'],
      ['제주특별자치도 제주시', '파라인슈1'],
      ['세종특별자치시 한솔동', '파라인슈1'],
    ] as const;
    for (const [addr, dept] of 실제응답) {
      expect(assignByAddress(addr)).toEqual({ kind: 'dept', dept });
    }
  });

  it('사람이 골라야 하는 지역도 정식 명칭으로 걸린다', () => {
    expect(assignByAddress('서울특별시 중구')).toEqual({ kind: 'select', region: '서울' });
    expect(assignByAddress('인천광역시 연수구')).toEqual({ kind: 'select', region: '인천' });
    expect(assignByAddress('강원특별자치도 춘천시')).toEqual({ kind: 'select', region: '강원' });
    expect(assignByAddress('경기도 성남시')).toEqual({ kind: 'select', region: '경기' });
  });
});
