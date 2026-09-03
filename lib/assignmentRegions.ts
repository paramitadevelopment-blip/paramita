/**
 * 주소 → 지역 판정.
 *
 * 배정 규칙이 보는 지역은 시·도 단위인데, 경기만 북부·남부로 나뉜다.
 * 시·도는 주소 첫 단어로, 경기 북/남은 그다음 시·군으로 가른다.
 *
 * 판정 규칙을 여기 한 곳에만 둔다 — 분류(미리보기)와 배포가 다른 규칙을 쓰면
 * 화면에서 본 것과 실제로 나가는 것이 갈린다.
 */

/**
 * 지역 목록. 화면에 이 순서대로 나열한다.
 *
 * 설정 표의 행이자 배정 판정의 단위다. 순서를 바꾸면 화면만 바뀌고
 * 판정은 그대로다 — 순서에 의미를 두는 코드를 만들지 않는다.
 */
export const REGIONS = [
  '서울',
  '경기북부',
  '경기남부',
  '강원',
  '충북',
  '충남',
  '경북',
  '경남',
  '전북',
  '전남',
  '제주',
  '인천',
  '부산',
  '대구',
  '대전',
  '광주',
  '울산',
  '세종',
] as const;

export type Region = (typeof REGIONS)[number];

/**
 * 경기 북부에 속하는 시·군.
 *
 * 주소는 '고양시', '남양주시'처럼 뒤에 시·군이 붙어 오므로 앞부분만 맞춰 본다.
 */
const GYEONGGI_NORTH = [
  '김포',
  '고양',
  '파주',
  '양주',
  '의정부',
  '남양주',
  '구리',
  '가평',
  '동두천',
  '포천',
  '연천',
] as const;

/** 경기 남부에 속하는 시·군 */
const GYEONGGI_SOUTH = [
  '부천',
  '광명',
  '시흥',
  '안산',
  '화성',
  '평택',
  '오산',
  '수원',
  '군포',
  '안양',
  '의왕',
  '과천',
  '성남',
  '용인',
  '안성',
  '하남',
  '광주',
  '이천',
  '여주',
  '양평',
] as const;

/**
 * 시·군까지 봐야 갈리는 지역과 그 시·군 목록. 지금은 경기만 나뉜다.
 *
 * 설정 화면의 '보기'가 이 목록을 그대로 보여준다 — 화면에 따로 적어 두면
 * 판정 규칙이 바뀌었을 때 화면만 옛말을 하게 된다.
 */
export const REGION_CITIES: Partial<Record<Region, readonly string[]>> = {
  경기북부: GYEONGGI_NORTH,
  경기남부: GYEONGGI_SOUTH,
};

/**
 * 시·도 첫 단어 → 지역.
 *
 * 정식 명칭(경상북도)과 줄임말(경북)이 섞여 들어오고, 요즘은 '강원특별자치도'처럼
 * 이름이 바뀐 곳도 있어 둘 다 받는다. '경기'는 여기 없다 — 시·군을 봐야 갈리므로
 * 아래에서 따로 다룬다.
 */
const SIDO_PATTERNS: Array<[RegExp, Region]> = [
  [/^서울/, '서울'],
  [/^인천/, '인천'],
  [/^(강원|강릉|속초)/, '강원'],
  [/^충청북도|^충북/, '충북'],
  [/^충청남도|^충남/, '충남'],
  [/^경상북도|^경북/, '경북'],
  [/^경상남도|^경남/, '경남'],
  [/^전라북도|^전북/, '전북'],
  [/^전라남도|^전남/, '전남'],
  [/^제주/, '제주'],
  [/^부산/, '부산'],
  [/^대구/, '대구'],
  [/^대전/, '대전'],
  [/^광주/, '광주'],
  [/^울산/, '울산'],
  [/^세종/, '세종'],
];

/** 주소를 공백·쉼표로 끊는다. 빈 조각은 버린다. */
function tokenize(address: unknown): string[] {
  return String(address ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
}

/**
 * 주소에서 지역을 읽는다. 못 읽으면 null.
 *
 * null은 '이외지역'으로 보낼 신호다. 조용히 아무 지역에나 넣으면 잘못 나간 건을
 * 나중에 되짚을 수 없다.
 *
 * '광주'는 첫 단어일 때만 광주광역시다. '경기 광주시'는 첫 단어가 '경기'라
 * 시·군을 보러 가므로 둘이 섞이지 않는다.
 */
export function detectRegion(address: unknown): Region | null {
  const tokens = tokenize(address);
  if (tokens.length === 0) return null;

  const [sido, sigun = ''] = tokens;

  if (/^경기/.test(sido)) {
    if (GYEONGGI_NORTH.some((city) => sigun.startsWith(city))) return '경기북부';
    if (GYEONGGI_SOUTH.some((city) => sigun.startsWith(city))) return '경기남부';
    // 경기인 건 알지만 어느 쪽인지 모른다. 둘 중 하나로 찍으면 절반은 틀리므로
    // 못 읽은 것으로 본다 — 이외지역으로 가서 사람 눈에 띄는 편이 낫다.
    return null;
  }

  for (const [pattern, region] of SIDO_PATTERNS) {
    if (pattern.test(sido)) return region;
  }

  return null;
}
