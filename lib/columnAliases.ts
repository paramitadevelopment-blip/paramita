/**
 * 거래처 엑셀 양식이 두 가지다. 신규 양식을 읽는 시점에 기존 컬럼 이름으로
 * 바꿔놓아, 그 아래 로직(중복제거·보험사 판정·부서 배정·배포)이 양식을
 * 몰라도 되게 한다.
 *
 * 변환 규칙은 여기 한 곳에만 둔다. 미리보기(classify)와 실제 배포(deploy)가
 * 다른 규칙을 쓰면 화면에서 본 것과 실제로 나가는 것이 갈린다.
 * findRequiredColumns를 한 곳에 모아둔 것과 같은 이유다.
 */

/** 신규 양식에만 있는 열. 이 둘이 다 있으면 신규 양식으로 본다. */
const NEW_FORMAT_MARKERS = ['관련번호', '고객번호'];

/** 신규 이름 → 기존 이름. 1:1로 옮기기만 하면 되는 것들. */
const RENAME: Record<string, string> = {
  관련번호: '생년월일성별',
  고객번호: '주문번호',
  상품명: '옵션1',
  휴대폰: 'Tel1',
  특이사항: '비고',
};

/** 값을 안 쓰는 열. 기존 양식에 대응하는 자리가 없다. */
const DROP = ['Color 설명', 'Style 설명', '희망통화시간'];

/**
 * 위에서 이미 다른 열로 옮겨 담은 것들. 한 번 더 남기면 같은 값이 두 열에 실린다.
 *
 * RENAME에 없는 것들이라 따로 적어 둔다 — 옮기는 규칙이 1:1이 아니어서
 * (전화번호는 폴백이 있고, 주문일시는 둘로 갈라지고, 방문일정은 형식이 바뀐다)
 * RENAME 표에 넣을 수 없었다.
 */
const CONSUMED = ['전화번호', '주문일시', '방문일정'];

/**
 * 상품명이 될 열. 접두사로 찾는다 — 위탁사마다 '위탁사명3-1', '위탁사명5-2'처럼
 * 접미사가 달라서 정확히 일치시키면 다음 파일에서 못 찾는다.
 */
const PRODUCT_PREFIX = '위탁사명';

/** 변환이 끝난 뒤의 열 순서. 기존 양식이 내놓는 것과 같은 모양으로 맞춘다. */
const OUTPUT_HEADERS = [
  '상품명',
  '옵션1',
  '주문상태',
  '고객명',
  'Tel1',
  'Tel2',
  '우편번호',
  '주소',
  '생년월일성별',
  '상담메모',
  '접수일자',
  '접수시간',
  '비고',
  '주문번호',
];

/** 신규 양식인가 */
export function isNewFormat(headers: string[]): boolean {
  const set = new Set(headers.map((h) => String(h ?? '').trim()));
  return NEW_FORMAT_MARKERS.every((m) => set.has(m));
}

/**
 * 연도 없는 날짜에 연도를 붙인다.
 *
 * 신규 양식의 주문일시는 '08/22 19:03'처럼 연도가 없다. 무조건 올해로 보면
 * 연말·연초에 뒤집힌다 — 1월에 12월 주문 건을 올리면 11개월 뒤 미래가 된다.
 * 그래서 올해로 본 날짜가 한 달 이상 미래면 작년으로 본다.
 */
function inferYear(month: number, day: number, now: Date): number {
  const year = now.getFullYear();
  const asThisYear = new Date(year, month - 1, day);
  const monthAhead = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 31);
  return asThisYear.getTime() > monthAhead.getTime() ? year - 1 : year;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 신규 양식의 주문일시를 접수일자·접수시간으로 나눈다.
 * '08/22 19:03' → { date: '2026-08-22', time: '19:03' }
 *
 * 못 읽으면 원문을 날짜 자리에 그대로 둔다. 조용히 버리면 어떤 값이었는지
 * 되짚을 수 없다.
 */
export function splitOrderDateTime(
  value: unknown,
  now: Date = new Date()
): { date: string; time: string } {
  const text = String(value ?? '').trim();
  if (!text) return { date: '', time: '' };

  // 연도가 있는 형태('2026-08-22 19:03')도 받는다. 거래처가 언제 바꿀지 모른다.
  const withYear = text.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (withYear) {
    const [, y, mo, d, h, mi] = withYear;
    return {
      date: `${y}-${pad(Number(mo))}-${pad(Number(d))}`,
      time: h ? `${pad(Number(h))}:${mi}` : '',
    };
  }

  const noYear = text.match(/(\d{1,2})[-./](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!noYear) return { date: text, time: '' };

  const [, mo, d, h, mi] = noYear;
  const month = Number(mo);
  const day = Number(d);
  return {
    date: `${inferYear(month, day, now)}-${pad(month)}-${pad(day)}`,
    time: h ? `${pad(Number(h))}:${mi}` : '',
  };
}

/**
 * 신규 양식의 방문일정을 상담메모 형식으로 바꾼다.
 * '2026-08-31 (월) 10시' → '2026-08-31 10:00:00'
 *
 * 이건 보기 좋으라고 하는 정리가 아니다. parseMemoDateTime의 정규식은 시간에
 * 콜론을 요구해서, '10시'를 그대로 넘기면 날짜만 읽히고 시간이 통째로 버려져
 * 00:00이 된다. 오류도 안 난다. 상담메모 규칙은 '그날 11시 이전이면 파라 계열'
 * 인데, 00:00이 되면 그날 오후 약속까지 전부 11시 이전으로 잘못 판정되어
 * 엉뚱한 부서로 나간다.
 */
export function normalizeVisitSchedule(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const date = text.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!date) return text;

  const [, y, mo, d] = date;
  const dateStr = `${y}-${pad(Number(mo))}-${pad(Number(d))}`;

  // 날짜 뒤쪽에서만 시간을 찾는다. 앞에서 찾으면 연·월·일 숫자를 시로 잘못 읽는다.
  const rest = text.slice(date.index! + date[0].length);

  // '오후 2시'는 14시다. 오전/오후를 무시하면 12시간이 어긋난다.
  const isPm = /오후/.test(rest);
  const isAm = /오전/.test(rest);

  // '10시 30분' / '10시' / '10:30'
  const hm = rest.match(/(\d{1,2})\s*(?:시|:)\s*(\d{1,2})?/);
  if (!hm) return dateStr;

  let hour = Number(hm[1]);
  const minute = hm[2] ? Number(hm[2]) : 0;

  if (isPm && hour < 12) hour += 12;
  if (isAm && hour === 12) hour = 0;

  return `${dateStr} ${pad(hour)}:${pad(minute)}:00`;
}

/**
 * 주민번호를 기존 양식과 같은 모양으로 맞춘다.
 * '970107-2000000' → '9701072******'
 *
 * 기존 양식은 앞 7자리(생년월일 + 성별)만 남기고 뒤 6자리를 가린 채로 온다.
 * 신규 양식은 하이픈째로 13자리를 그대로 보내는데, 그대로 두면
 *   - 두 양식의 같은 열이 다른 모양이 되어 눈으로도 검색으로도 안 맞고
 *   - 가릴 이유가 있어서 가려 온 뒷자리를 우리가 되살려 저장하게 된다.
 *
 * 앞 7자리는 남긴다 — 나이 계산이 이 자리를 본다.
 * 읽을 수 없는 값이면 원문을 그대로 둔다. 조용히 지우면 왜 배정이 틀렸는지
 * 되짚을 수 없다.
 */
export function maskJumin(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';

  const digits = text.replace(/[-\s]/g, '');
  if (digits.length < 7 || !/^\d{7}/.test(digits)) return text;

  return digits.slice(0, 7) + '******';
}

/**
 * 입력창이 받아들일 숫자만 남긴다.
 *
 * 주민번호 앞자리 칸은 6글자까지만 받는데, 하이픈이나 공백이 한 글자라도
 * 섞이면 그만큼 진짜 숫자가 밀려 잘린다. 그러면 뒤에 붙는 성별 코드가
 * 여섯 번째 자리로 올라가 저장할 때 통째로 사라진다.
 */
export function digitsOnly(value: string, max: number): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, max);
}

/**
 * 화면에 보여줄 주민번호. `970107-1` 꼴로 하이픈을 넣는다.
 *
 * 저장된 값은 표기가 흔들린다 — 수동 등록은 `9701071`, 파일에서 온 건
 * `9701071******`, 옛 행은 6자리만 있기도 하다. 어느 쪽이 와도 한 모양으로
 * 보여줘야 관리자가 표를 훑으며 대조할 수 있다.
 *
 * 뒷자리 별표는 붙이지 않는다. 우리가 갖고 있지도 않은 자리를 그려 봐야
 * 칸만 넓어지고, 여섯 자리가 가려져 있다는 건 이미 모두가 안다.
 *
 * 성별 코드가 없으면 하이픈째로 뗀다. `970107-`처럼 끝나면 뒤가 잘린 것처럼 보인다.
 */
export function formatJuminForDisplay(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 6) return '-';

  const birth = digits.slice(0, 6);
  if (digits.length < 7) return birth;

  return `${birth}-${digits.slice(6, 7)}`;
}

/**
 * 신규 양식 시트를 기존 컬럼 이름으로 바꾼다.
 * 기존 양식이면 받은 것을 그대로 돌려준다.
 *
 * 새 행을 처음부터 만든다. 제자리에서 이름만 바꾸면 '위탁사명→상품명'과
 * '상품명→옵션1'이 서로 덮어써서 한쪽이 사라진다.
 */
export function normalizeSheet(
  headers: string[],
  rows: any[][],
  now: Date = new Date()
): { headers: string[]; rows: any[][]; converted: boolean } {
  if (!isNewFormat(headers)) {
    return { headers, rows, converted: false };
  }

  const clean = headers.map((h) => String(h ?? '').trim());
  const idxOf = (name: string) => clean.indexOf(name);
  const productIdx = clean.findIndex((h) => h.startsWith(PRODUCT_PREFIX));

  // 신규 양식에만 있고 기존에 대응이 없는 열. 원본 기록용으로 남긴다
  // (배포 파일에는 EXCLUDED_COLUMNS가 걸러낸다).
  const extras = clean.filter(
    (h) =>
      h &&
      !DROP.includes(h) &&
      !RENAME[h] &&
      !CONSUMED.includes(h) &&
      !h.startsWith(PRODUCT_PREFIX) &&
      !OUTPUT_HEADERS.includes(h)
  );

  const outHeaders = [...OUTPUT_HEADERS, ...extras];

  const outRows = rows.map((row) => {
    const get = (name: string) => {
      const i = idxOf(name);
      return i < 0 ? '' : row?.[i] ?? '';
    };

    const { date, time } = splitOrderDateTime(get('주문일시'), now);

    // 전화번호가 비면 휴대폰 값을 쓴다. Tel2는 중복 판정 기준이라
    // 비어 있으면 서로 다른 사람이 같은 사람으로 묶인다.
    const mobile = get('휴대폰');
    const landline = String(get('전화번호') ?? '').trim();

    const built: Record<string, any> = {
      상품명: productIdx < 0 ? '' : row?.[productIdx] ?? '',
      옵션1: get('상품명'),
      주문상태: get('주문상태'),
      고객명: get('고객명'),
      Tel1: mobile,
      Tel2: landline || mobile,
      우편번호: get('우편번호'),
      주소: get('주소'),
      생년월일성별: maskJumin(get('관련번호')),
      상담메모: normalizeVisitSchedule(get('방문일정')),
      접수일자: date,
      접수시간: time,
      비고: get('특이사항'),
      주문번호: get('고객번호'),
    };

    for (const name of extras) built[name] = get(name);

    return outHeaders.map((h) => built[h] ?? '');
  });

  return { headers: outHeaders, rows: outRows, converted: true };
}

/**
 * 객체 배열용. classify 경로는 sheet_to_json이 객체를 주므로 이쪽을 쓴다.
 * 안쪽은 normalizeSheet와 같은 규칙이다.
 */
export function normalizeRecords(
  records: Record<string, any>[],
  now: Date = new Date()
): { records: Record<string, any>[]; converted: boolean } {
  if (records.length === 0) return { records, converted: false };

  const headers = Object.keys(records[0]);
  if (!isNewFormat(headers)) return { records, converted: false };

  const rows = records.map((r) => headers.map((h) => r[h]));
  const out = normalizeSheet(headers, rows, now);

  return {
    records: out.rows.map((row) =>
      Object.fromEntries(out.headers.map((h, i) => [h, row[i]]))
    ),
    converted: true,
  };
}
