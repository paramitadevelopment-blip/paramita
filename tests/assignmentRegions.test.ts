import { describe, it, expect } from 'vitest';
import { detectRegion, REGIONS, REGION_CITIES } from '@/lib/assignmentRegions';

/**
 * 주소 → 지역 판정.
 *
 * 이 판정이 틀리면 건이 통째로 엉뚱한 지사로 간다. 되짚을 방법이 없으므로
 * 실제로 들어오는 표기(정식 명칭·줄임말·특별자치도)를 모두 못 박아 둔다.
 */

describe('시·도 판정', () => {
  const cases: Array<[string, string]> = [
    ['서울 강남구 역삼동', '서울'],
    ['인천 연수구 청학동', '인천'],
    ['강원 춘천시', '강원'],
    ['강원특별자치도 춘천시', '강원'],
    ['충북 청주시', '충북'],
    ['충청북도 청주시', '충북'],
    ['충남 천안시', '충남'],
    ['충청남도 천안시', '충남'],
    ['경북 포항시', '경북'],
    ['경상북도 포항시', '경북'],
    ['경남 창원시', '경남'],
    ['경상남도 창원시', '경남'],
    ['전북 전주시', '전북'],
    ['전라북도 전주시', '전북'],
    ['전북특별자치도 전주시', '전북'],
    ['전남 여수시', '전남'],
    ['전라남도 여수시', '전남'],
    ['제주 제주시', '제주'],
    ['제주특별자치도 서귀포시', '제주'],
    ['부산 해운대구', '부산'],
    ['대구 수성구', '대구'],
    ['대전 유성구', '대전'],
    ['울산 남구', '울산'],
    ['세종 조치원읍', '세종'],
  ];

  for (const [address, region] of cases) {
    it(`${address} → ${region}`, () => {
      expect(detectRegion(address)).toBe(region);
    });
  }
});

describe('경기는 시·군으로 북부·남부를 가른다', () => {
  /*
   * 소스를 그대로 가져오지 않고 여기 따로 적는다.
   * 소스에서 시·군이 실수로 빠져도 잡으려면 명세가 독립적이어야 한다 —
   * REGION_CITIES를 그대로 돌리면 무슨 값이 들어 있든 항상 통과한다.
   * 대신 아래 '목록이 소스와 같다'로 둘이 어긋나는 것을 막는다.
   */
  const north = [
    '김포', '고양', '파주', '양주', '의정부', '남양주', '구리', '가평', '동두천', '연천',
    '포천',
  ];
  const south = [
    '부천', '광명', '시흥', '안산', '화성', '평택', '오산', '수원', '군포', '안양',
    '의왕', '과천', '성남', '용인', '안성', '하남', '광주', '이천', '여주', '양평',
  ];

  // 소스에 추가만 하고 여기를 안 고치면 명세가 조용히 뒤처진다.
  it('명세 목록이 소스(REGION_CITIES)와 같다', () => {
    expect([...(REGION_CITIES['경기북부'] ?? [])].sort()).toEqual([...north].sort());
    expect([...(REGION_CITIES['경기남부'] ?? [])].sort()).toEqual([...south].sort());
  });

  for (const city of north) {
    it(`경기 ${city}시 → 경기북부`, () => {
      expect(detectRegion(`경기 ${city}시 어딘가`)).toBe('경기북부');
    });
  }

  for (const city of south) {
    it(`경기 ${city}시 → 경기남부`, () => {
      expect(detectRegion(`경기 ${city}시 어딘가`)).toBe('경기남부');
    });
  }

  it('경기도라고 길게 써도 같다', () => {
    expect(detectRegion('경기도 성남시 분당구')).toBe('경기남부');
    expect(detectRegion('경기도 고양시 일산동구')).toBe('경기북부');
  });

  /**
   * 어느 쪽인지 모르는 채로 둘 중 하나를 찍으면 절반은 틀린다.
   * 못 읽은 것으로 보아 이외지역으로 보내는 편이 사람 눈에 띈다.
   */
  it('경기인데 시·군을 모르면 못 읽은 것으로 본다', () => {
    expect(detectRegion('경기')).toBeNull();
    expect(detectRegion('경기도 없는시')).toBeNull();
  });
});

/**
 * '광주'는 광역시이면서 경기도의 시이기도 하다.
 * 첫 단어일 때만 광역시로 본다 — 이게 어긋나면 전라도 건이 경기로 샌다.
 */
describe('광주가 겹치는 문제', () => {
  it('광주 북구 → 광주(광역시)', () => {
    expect(detectRegion('광주 북구 운암동')).toBe('광주');
  });

  it('경기 광주시 → 경기남부', () => {
    expect(detectRegion('경기 광주시 오포읍')).toBe('경기남부');
  });
});

describe('읽을 수 없는 주소', () => {
  it('비어 있으면 null', () => {
    expect(detectRegion('')).toBeNull();
    expect(detectRegion('   ')).toBeNull();
    expect(detectRegion(null)).toBeNull();
    expect(detectRegion(undefined)).toBeNull();
  });

  it('시·도가 아닌 값이면 null', () => {
    expect(detectRegion('경냄 어딘가')).toBeNull();
    expect(detectRegion('12345')).toBeNull();
  });
});

describe('지역 목록', () => {
  it('18개이고 중복이 없다', () => {
    expect(REGIONS).toHaveLength(18);
    expect(new Set(REGIONS).size).toBe(18);
  });

  /** 판정이 돌려주는 값은 반드시 목록 안에 있어야 화면·설정과 맞는다. */
  it('판정 결과는 모두 목록 안의 값이다', () => {
    const samples = ['서울 강남구', '경기 수원시', '경기 고양시', '제주 제주시', '세종 한솔동'];
    for (const address of samples) {
      expect(REGIONS).toContain(detectRegion(address)!);
    }
  });
});

/**
 * 설정 화면의 '보기'가 보여주는 시·군 목록.
 *
 * 화면이 "고양은 북부"라고 알려줬는데 실제 판정은 다르게 하면, 그 말을 믿고
 * 규칙을 짠 사람이 틀린 설정을 하게 된다. 목록에 적힌 시·군은 하나도 빠짐없이
 * 그 지역으로 판정돼야 한다.
 */
describe('시·군 목록(REGION_CITIES)과 판정이 일치한다', () => {
  it('목록의 키는 모두 실제 지역이다', () => {
    for (const region of Object.keys(REGION_CITIES)) {
      expect(REGIONS).toContain(region);
    }
  });

  it('목록에 적힌 시·군은 모두 그 지역으로 판정된다', () => {
    for (const [region, cities] of Object.entries(REGION_CITIES)) {
      for (const city of cities ?? []) {
        // 실제 주소는 '고양시', '가평군'처럼 붙어서 온다
        expect(detectRegion(`경기 ${city}시`), `경기 ${city}시`).toBe(region);
        expect(detectRegion(`경기 ${city}`), `경기 ${city}`).toBe(region);
      }
    }
  });

  it('북부와 남부에 같은 시·군이 겹치지 않는다', () => {
    const north = REGION_CITIES['경기북부'] ?? [];
    const south = REGION_CITIES['경기남부'] ?? [];
    const overlap = north.filter((city) => south.includes(city));
    expect(overlap).toEqual([]);
  });
});
