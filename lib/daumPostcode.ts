/**
 * 주소 검색 — 다음(카카오) 우편번호 서비스.
 *
 * 주소를 손으로 치면 오타가 난다. 오타 난 주소로 사은품이 나가면 반송되거나
 * 엉뚱한 곳에 간다. 그래서 주소는 **검색해서 고른 값만** 받는다 — 도로명 주소와
 * 우편번호가 한 번에 오고, 사람은 동·호수 같은 상세만 적는다.
 *
 * 스크립트는 처음 쓸 때 한 번만 붙인다. 이 화면을 안 여는 사람에게까지 내려받게
 * 할 이유가 없다.
 */

const SCRIPT_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

export interface PickedAddress {
  zip: string;
  /** 도로명 주소. 없으면 지번 주소. */
  address: string;
}

interface PostcodeData {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName?: string;
  apartment?: 'Y' | 'N';
}

interface PostcodeInstance {
  open: () => void;
}

interface PostcodeCtor {
  new (options: {
    oncomplete: (data: PostcodeData) => void;
    onclose?: (state: 'FORCE_CLOSE' | 'COMPLETE_CLOSE') => void;
  }): PostcodeInstance;
}

declare global {
  interface Window {
    daum?: { Postcode: PostcodeCtor };
  }
}

let loading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저에서만 쓸 수 있습니다.'));
  if (window.daum?.Postcode) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error('주소 검색을 불러오지 못했습니다. 잠시 뒤 다시 해 주세요.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * 검색 창을 띄우고 고른 주소를 돌려준다. 고르지 않고 닫으면 null.
 *
 * 아파트면 건물 이름을 뒤에 붙인다 — 거래처 파일의 주소가 그렇게 적혀 있고,
 * 택배 기사도 그걸 본다.
 */
export async function pickAddress(): Promise<PickedAddress | null> {
  await loadScript();
  const Postcode = window.daum!.Postcode;
  return new Promise((resolve) => {
    let picked: PickedAddress | null = null;
    new Postcode({
      oncomplete: (data) => {
        const base = data.roadAddress || data.jibunAddress;
        const building = data.apartment === 'Y' && data.buildingName ? ` (${data.buildingName})` : '';
        picked = { zip: data.zonecode, address: `${base}${building}` };
      },
      onclose: () => resolve(picked),
    }).open();
  });
}
