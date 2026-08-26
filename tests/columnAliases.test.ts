import { describe, it, expect } from 'vitest';
import {
  isNewFormat,
  normalizeSheet,
  normalizeRecords,
  splitOrderDateTime,
  normalizeVisitSchedule,
  maskJumin,
} from '@/lib/columnAliases';
import {
  findRequiredColumns,
  getInsurerType,
  isMemoBeforeCutoff,
  calculateInsuranceAge,
  isExcludedColumn,
  formatInsurerKind,
  getInsurerTypeFromRows,
  INSURER_KIND_COLUMN,
  normalizeBirth,
} from '@/lib/insurance';

/**
 * 거래처 엑셀 양식 두 가지를 모두 받는지 검증.
 *
 * 여기가 틀리면 신규 양식이 통째로 막히거나(필수 컬럼 못 찾음),
 * 더 나쁘게는 값이 엉뚱한 열로 들어가 조용히 잘못 배정된다.
 */

// 실제 20260824 파일에서 뽑은 헤더·값
const NEW_HEADERS = [
  '위탁사명3-1', '고객명', '관련번호', '휴대폰', '전화번호', '배송메세지',
  '주문일시', '주문상태', '', '상품명', 'Color 설명', 'Style 설명',
  '우편번호', '주소', '설치비공지', '특이사항', '희망통화시간',
  '고객번호', '방문일정', '마켓팅 동의',
];
const NEW_ROW = [
  '동양생명(PA-01간병)보관에프', '김철수', '580101-1000000', '010-2544-1234',
  '010-2544-1234', '', '08/22 19:03', '주문접수', null,
  '동양생명 방문거부시(전화상담)', '공통', '공통', '695960', '제주 제주시',
  'N', '', '', '67145620', '2026-08-31 (월) 10시', 'Y',
];

// 실제 20260816 파일에서 뽑은 헤더·값
const OLD_HEADERS = [
  '구분', '방송사명', '상품명', '옵션1', '주문상태', '고객명', 'Tel1', 'Tel2',
  '우편번호', '주소', '생년월일성별', '상담메모', '접수일자', '접수시간',
  '업체명', '비고', '주문번호',
];
const OLD_ROW = [
  '예약', '동양생명PM_치매간병보험_001', '동양생명(치매간병보험)_상담예약',
  '전화상담', '주문접수', '윤슬하', '010-5213-1047', '010-5213-1047',
  '21318', '인천 연수구 청학동', '6609012******', '2026-08-14 11:00:00',
  '2026-08-11', '20:43:17', '동양생명(PM)_1통합', '', '20796840',
];

const NOW = new Date(2026, 7, 24, 9, 0, 0);
const asObj = (h: string[], r: any[]) => Object.fromEntries(h.map((k, i) => [k, r[i]]));

describe('양식 판별', () => {
  it('신규 양식을 알아본다', () => {
    expect(isNewFormat(NEW_HEADERS)).toBe(true);
  });

  it('기존 양식은 신규로 오해하지 않는다', () => {
    expect(isNewFormat(OLD_HEADERS)).toBe(false);
  });

  it('표식이 하나만 있으면 신규가 아니다', () => {
    expect(isNewFormat(['관련번호', '고객명'])).toBe(false);
    expect(isNewFormat(['고객번호', '고객명'])).toBe(false);
  });
});

describe('기존 양식은 건드리지 않는다', () => {
  it('헤더와 행이 그대로 나온다', () => {
    const out = normalizeSheet(OLD_HEADERS, [OLD_ROW], NOW);
    expect(out.converted).toBe(false);
    expect(out.headers).toBe(OLD_HEADERS);
    expect(out.rows).toEqual([OLD_ROW]);
  });

  it('객체 경로도 그대로 나온다', () => {
    const rec = [asObj(OLD_HEADERS, OLD_ROW)];
    const out = normalizeRecords(rec, NOW);
    expect(out.converted).toBe(false);
    expect(out.records).toBe(rec);
  });

  it('빈 입력에도 터지지 않는다', () => {
    expect(normalizeRecords([], NOW).records).toEqual([]);
  });
});

describe('신규 양식 매핑', () => {
  const out = normalizeSheet(NEW_HEADERS, [NEW_ROW], NOW);
  const row = Object.fromEntries(out.headers.map((h, i) => [h, out.rows[0][i]]));

  it('위탁사명이 상품명이 된다 — 보험사를 여기서 가린다', () => {
    expect(row['상품명']).toBe('동양생명(PA-01간병)보관에프');
    expect(getInsurerType(row['상품명'])).toBe('dy');
  });

  it('원래 상품명은 옵션1로 간다', () => {
    expect(row['옵션1']).toBe('동양생명 방문거부시(전화상담)');
  });

  it('관련번호가 생년월일성별이 된다 — 나이 계산의 근거다', () => {
    expect(row['생년월일성별']).toBe('5801011******');
    expect(calculateInsuranceAge(row['생년월일성별'])).toBe(69);
  });

  it('고객번호가 주문번호가 된다', () => {
    expect(row['주문번호']).toBe('67145620');
  });

  it('휴대폰은 Tel1, 전화번호는 Tel2', () => {
    expect(row['Tel1']).toBe('010-2544-1234');
    expect(row['Tel2']).toBe('010-2544-1234');
  });

  it('고객명·우편번호·주소·주문상태는 그대로', () => {
    expect(row['고객명']).toBe('김철수');
    expect(row['우편번호']).toBe('695960');
    expect(row['주소']).toBe('제주 제주시');
    expect(row['주문상태']).toBe('주문접수');
  });

  it('특이사항이 비고가 된다', () => {
    expect(row['비고']).toBe('');
  });

  /**
   * 시트 변환이 방문일정을 그냥 옮기기만 하면 시간이 죽는다.
   * normalizeVisitSchedule을 따로 테스트하는 것만으로는 이 배선이 검증되지 않는다.
   */
  it('방문일정이 상담메모 형식으로 바뀌어 들어간다', () => {
    expect(row['상담메모']).toBe('2026-08-31 10:00:00');
  });

  it('주문일시가 접수일자·접수시간으로 나뉘어 들어간다', () => {
    expect(row['접수일자']).toBe('2026-08-22');
    expect(row['접수시간']).toBe('19:03');
  });

  it('필요없는 열은 빠진다', () => {
    for (const h of ['Color 설명', 'Style 설명', '희망통화시간']) {
      expect(out.headers).not.toContain(h);
    }
  });

  /**
   * 옮겨 담은 원본 열이 그대로 남으면 같은 값이 두 열에 실린다.
   * 실제로 배포 파일에 Tel2와 전화번호가 나란히 나갔던 적이 있다.
   */
  it('옮겨 담은 원본 열은 남지 않는다', () => {
    for (const h of ['전화번호', '주문일시', '방문일정', '관련번호', '고객번호', '휴대폰', '특이사항']) {
      expect(out.headers).not.toContain(h);
    }
  });

  it('위탁사명 원본 열도 남지 않는다', () => {
    expect(out.headers.some((h) => h.startsWith('위탁사명'))).toBe(false);
  });

  it('같은 값이 두 열에 실리지 않는다', () => {
    const dup = out.headers.filter((h, i) => out.headers.indexOf(h) !== i);
    expect(dup).toEqual([]);
  });

  it('대응 없는 열은 남기되 배포 파일엔 안 나간다', () => {
    for (const h of ['배송메세지', '설치비공지', '마켓팅 동의']) {
      expect(out.headers).toContain(h);
      expect(isExcludedColumn(h)).toBe(true);
    }
  });

  it('위탁사명 접미사가 달라도 찾는다', () => {
    const h = NEW_HEADERS.map((x) => (x === '위탁사명3-1' ? '위탁사명12-7' : x));
    const o = normalizeSheet(h, [NEW_ROW], NOW);
    const r = Object.fromEntries(o.headers.map((k, i) => [k, o.rows[0][i]]));
    expect(r['상품명']).toBe('동양생명(PA-01간병)보관에프');
  });
});

/**
 * 주민번호 표기 통일.
 *
 * 두 양식이 같은 열에 다른 모양을 넣으면 눈으로도 검색으로도 안 맞는다.
 * 그리고 가려서 온 뒷자리를 우리가 되살려 저장할 이유가 없다.
 */
describe('주민번호 가리기', () => {
  it('신규 양식 13자리를 기존 양식 모양으로 맞춘다', () => {
    expect(maskJumin('970107-2000000')).toBe('9701072******');
    expect(maskJumin('580101-1000000')).toBe('5801011******');
  });

  it('기존 양식과 자릿수가 같다 — 앞 7자리 + 별표 6개 = 13자', () => {
    const masked = maskJumin('970107-2000000');
    expect(masked).toHaveLength(13);
    expect((masked.match(/\*/g) ?? []).length).toBe(6);
  });

  it('이미 가려진 값은 그대로 둔다', () => {
    expect(maskJumin('6609012******')).toBe('6609012******');
  });

  it('하이픈이 없어도 된다', () => {
    expect(maskJumin('9701072000000')).toBe('9701072******');
  });

  /**
   * 가리고 나서도 나이를 뽑을 수 있어야 한다. 앞 7자리가 생년월일과
   * 성별코드고, 배정이 전적으로 이 나이에 달려 있다.
   */
  it('가려도 나이 계산이 그대로 된다', () => {
    const 원본 = '580101-1000000';
    expect(calculateInsuranceAge(maskJumin(원본))).toBe(calculateInsuranceAge(원본));
  });

  it('2000년대생 성별코드도 살아남는다', () => {
    // 성별코드 3·4는 2000년대생이다. 이 자리가 잘리면 100년이 어긋난다.
    expect(maskJumin('050307-3000000')).toBe('0503073******');
    expect(calculateInsuranceAge('0503073******')).toBe(calculateInsuranceAge('050307-3000000'));
  });

  it('읽을 수 없으면 원문을 남긴다 — 조용히 지우면 되짚을 수 없다', () => {
    expect(maskJumin('확인불가')).toBe('확인불가');
    expect(maskJumin('12345')).toBe('12345');
  });

  it('빈 값은 빈 값', () => {
    expect(maskJumin('')).toBe('');
    expect(maskJumin(null)).toBe('');
  });
});

describe('Tel2 폴백 — 중복 판정 기준이라 비면 안 된다', () => {
  it('전화번호가 비면 휴대폰 값을 쓴다', () => {
    const r = [...NEW_ROW];
    r[4] = '';
    const o = normalizeSheet(NEW_HEADERS, [r], NOW);
    const row = Object.fromEntries(o.headers.map((h, i) => [h, o.rows[0][i]]));
    expect(row['Tel2']).toBe('010-2544-1234');
  });

  it('공백만 있어도 휴대폰 값을 쓴다', () => {
    const r = [...NEW_ROW];
    r[4] = '   ';
    const o = normalizeSheet(NEW_HEADERS, [r], NOW);
    const row = Object.fromEntries(o.headers.map((h, i) => [h, o.rows[0][i]]));
    expect(row['Tel2']).toBe('010-2544-1234');
  });

  it('둘 다 있으면 전화번호를 쓴다', () => {
    const r = [...NEW_ROW];
    r[4] = '02-123-4567';
    const o = normalizeSheet(NEW_HEADERS, [r], NOW);
    const row = Object.fromEntries(o.headers.map((h, i) => [h, o.rows[0][i]]));
    expect(row['Tel2']).toBe('02-123-4567');
    expect(row['Tel1']).toBe('010-2544-1234');
  });
});

describe('주문일시 나누기', () => {
  it('연도를 붙여 날짜와 시간으로 나눈다', () => {
    expect(splitOrderDateTime('08/22 19:03', NOW)).toEqual({
      date: '2026-08-22',
      time: '19:03',
    });
  });

  it('한 달 이상 미래면 작년으로 본다 — 연초에 작년 12월 건이 올라온다', () => {
    const jan = new Date(2027, 0, 5, 9, 0, 0);
    expect(splitOrderDateTime('12/22 19:03', jan).date).toBe('2026-12-22');
  });

  it('가까운 미래는 올해로 둔다', () => {
    expect(splitOrderDateTime('08/30 10:00', NOW).date).toBe('2026-08-30');
  });

  it('연도가 이미 있으면 그대로 쓴다', () => {
    expect(splitOrderDateTime('2025-03-04 08:05', NOW)).toEqual({
      date: '2025-03-04',
      time: '08:05',
    });
  });

  it('한 자리 월·일도 두 자리로 맞춘다', () => {
    expect(splitOrderDateTime('1/5 9:07', new Date(2026, 0, 20)).date).toBe('2026-01-05');
  });

  it('빈 값은 빈 값', () => {
    expect(splitOrderDateTime('', NOW)).toEqual({ date: '', time: '' });
  });

  it('못 읽으면 원문을 남긴다 — 조용히 버리면 되짚을 수 없다', () => {
    expect(splitOrderDateTime('알수없음', NOW).date).toBe('알수없음');
  });
});

describe('방문일정 → 상담메모', () => {
  it('10시가 10:00:00이 된다', () => {
    expect(normalizeVisitSchedule('2026-08-31 (월) 10시')).toBe('2026-08-31 10:00:00');
  });

  it('분까지 읽는다', () => {
    expect(normalizeVisitSchedule('2026-08-31 (월) 10시 30분')).toBe('2026-08-31 10:30:00');
  });

  it('오후는 12를 더한다 — 안 더하면 12시간 어긋난다', () => {
    expect(normalizeVisitSchedule('2026-08-31 (월) 오후 2시')).toBe('2026-08-31 14:00:00');
  });

  it('오후 12시는 그대로 12시', () => {
    expect(normalizeVisitSchedule('2026-08-31 오후 12시')).toBe('2026-08-31 12:00:00');
  });

  it('오전 12시는 0시', () => {
    expect(normalizeVisitSchedule('2026-08-31 오전 12시')).toBe('2026-08-31 00:00:00');
  });

  it('콜론 형식도 받는다', () => {
    expect(normalizeVisitSchedule('2026-08-31 14:30')).toBe('2026-08-31 14:30:00');
  });

  it('시간이 없으면 날짜만', () => {
    expect(normalizeVisitSchedule('2026-08-31')).toBe('2026-08-31');
  });

  it('빈 값은 빈 값', () => {
    expect(normalizeVisitSchedule('')).toBe('');
  });

  /**
   * 이게 이 변환을 만든 이유다.
   * '14시'를 그대로 넘기면 parseMemoDateTime이 시간을 버려 00:00이 되고,
   * 그날 오후 약속이 '11시 이전'으로 잘못 판정돼 엉뚱한 부서로 나간다.
   */
  it('그날 오후 약속이 11시 이전으로 둔갑하지 않는다', () => {
    const raw = '2026-08-24 (월) 14시';
    expect(isMemoBeforeCutoff(raw, NOW)).toBe(true); // 변환 안 하면 00:00으로 읽힌다
    expect(isMemoBeforeCutoff(normalizeVisitSchedule(raw), NOW)).toBe(false);
  });

  it('그날 오전 약속은 그대로 11시 이전이다', () => {
    const raw = '2026-08-24 (월) 9시';
    expect(isMemoBeforeCutoff(normalizeVisitSchedule(raw), NOW)).toBe(true);
  });
});

describe('변환 뒤 필수 컬럼을 다 찾는다', () => {
  const REQUIRED = ['addressCol', 'juminCol', 'orderCol', 'nameCol', 'phoneCol', 'productCol'];

  it('신규 양식 — 변환 전에는 못 찾는다', () => {
    const cols = findRequiredColumns(NEW_HEADERS) as any;
    expect(cols.juminCol).toBeNull();
    expect(cols.orderCol).toBeNull();
  });

  it('신규 양식 — 변환 후에는 다 찾는다', () => {
    const out = normalizeSheet(NEW_HEADERS, [NEW_ROW], NOW);
    const cols = findRequiredColumns(out.headers) as any;
    for (const k of REQUIRED) expect(cols[k]).toBeTruthy();
    expect(cols.memoCol).toBe('상담메모');
  });

  it('신규 양식 — Tel2가 중복 판정 기준으로 잡힌다', () => {
    const out = normalizeSheet(NEW_HEADERS, [NEW_ROW], NOW);
    expect((findRequiredColumns(out.headers) as any).phoneCol).toBe('Tel2');
  });

  it('기존 양식 — 그대로 다 찾는다', () => {
    const cols = findRequiredColumns(OLD_HEADERS) as any;
    for (const k of REQUIRED) expect(cols[k]).toBeTruthy();
  });
});

/**
 * 보험사구분 — 상품명으로 보험사를, 헤더 모양으로 로마숫자를 가린다.
 * 두 판정은 서로 독립이라 네 조합이 다 나와야 한다.
 */
describe('보험사구분 값', () => {
  it('기존 양식은 1, 신규 양식은 2', () => {
    expect(formatInsurerKind('dy', false)).toBe('동양1');
    expect(formatInsurerKind('dy', true)).toBe('동양2');
    expect(formatInsurerKind('hk', false)).toBe('흥국1');
    expect(formatInsurerKind('hk', true)).toBe('흥국2');
  });

  it('실제 기존 파일 → 동양1', () => {
    const out = normalizeSheet(OLD_HEADERS, [OLD_ROW], NOW);
    const cols = findRequiredColumns(out.headers) as any;
    const idx = out.headers.indexOf(cols.productCol);
    const insurer = getInsurerTypeFromRows(out.rows, idx)!;
    expect(formatInsurerKind(insurer, out.converted)).toBe('동양1');
  });

  it('실제 신규 파일 → 동양2', () => {
    const out = normalizeSheet(NEW_HEADERS, [NEW_ROW], NOW);
    const cols = findRequiredColumns(out.headers) as any;
    const idx = out.headers.indexOf(cols.productCol);
    const insurer = getInsurerTypeFromRows(out.rows, idx)!;
    expect(formatInsurerKind(insurer, out.converted)).toBe('동양2');
  });

  it('신규 양식에 흥국이 오면 흥국2가 된다 — 양식과 보험사는 별개다', () => {
    const row = [...NEW_ROW];
    row[0] = '흥국생명(PA-01간병)보관에프';
    const out = normalizeSheet(NEW_HEADERS, [row], NOW);
    const cols = findRequiredColumns(out.headers) as any;
    const idx = out.headers.indexOf(cols.productCol);
    const insurer = getInsurerTypeFromRows(out.rows, idx)!;
    expect(formatInsurerKind(insurer, out.converted)).toBe('흥국2');
  });

  it('업체가 받는 파일에도 나간다 — 제외 열이 아니다', () => {
    expect(isExcludedColumn(INSURER_KIND_COLUMN)).toBe(false);
  });

  /**
   * 통합검색은 부분 일치라, 한 값이 다른 값을 품고 있으면 갈라낼 수 없다.
   * 로마숫자를 쓰면 '동양I'로 찾을 때 '동양II'까지 딸려 나와 1형만 볼 방법이 없다.
   */
  it('어느 값도 다른 값을 품지 않는다 — 검색이 갈라야 한다', () => {
    const 값들 = [
      formatInsurerKind('dy', false),
      formatInsurerKind('dy', true),
      formatInsurerKind('hk', false),
      formatInsurerKind('hk', true),
    ];
    for (const a of 값들) {
      for (const b of 값들) {
        if (a === b) continue;
        expect(b.includes(a)).toBe(false);
      }
    }
  });

  it('보험사 이름만으로 찾으면 둘 다 걸린다', () => {
    expect(formatInsurerKind('dy', false).startsWith('동양')).toBe(true);
    expect(formatInsurerKind('dy', true).startsWith('동양')).toBe(true);
  });
});

describe('객체 경로도 같은 결과를 낸다', () => {
  it('classify와 deploy가 갈리면 화면과 실제가 어긋난다', () => {
    const viaSheet = normalizeSheet(NEW_HEADERS, [NEW_ROW], NOW);
    const expected = Object.fromEntries(viaSheet.headers.map((h, i) => [h, viaSheet.rows[0][i]]));

    const viaRecords = normalizeRecords([asObj(NEW_HEADERS, NEW_ROW)], NOW);
    expect(viaRecords.converted).toBe(true);
    expect(viaRecords.records[0]).toEqual(expected);
  });
});

describe('생년월일 정규화 (YYMMDD 형식)', () => {
  it('YYYY-MM-DD 형식을 YYMMDD로 변환', () => {
    expect(normalizeBirth('1995-11-05')).toBe('951105');
  });

  it('YYMMDD 형식은 그대로 반환', () => {
    expect(normalizeBirth('950101')).toBe('950101');
  });

  it('YYYYMMDD 형식도 처리 (뒤 6자리 취함)', () => {
    expect(normalizeBirth('19951105')).toBe('951105');
  });

  // 성별 코드는 남긴다. 같은 날 태어난 남녀를 가르는 유일한 값이라,
  // 떼어내면 블랙리스트에서 다른 사람이 한 사람으로 엮인다.
  it('성별 코드가 있으면 7자리로 유지 (YYMMDD성별)', () => {
    expect(normalizeBirth('9501011')).toBe('9501011');
  });

  it('성별 코드가 있고 하이픈도 있는 경우 (YYMMDD-성별)', () => {
    expect(normalizeBirth('950101-2')).toBe('9501012');
  });

  it('가려진 주민번호에서도 성별 코드까지 읽는다', () => {
    expect(normalizeBirth('9501011******')).toBe('9501011');
  });

  it('성별 코드만 다르면 다른 값이다', () => {
    expect(normalizeBirth('950101-1')).not.toBe(normalizeBirth('950101-2'));
  });

  it('빈 값은 빈 문자열 반환', () => {
    expect(normalizeBirth('')).toBe('');
    expect(normalizeBirth(null)).toBe('');
  });

  it('숫자가 6개 미만이면 빈 문자열 반환', () => {
    expect(normalizeBirth('12345')).toBe('');
  });

  // 뒤에서 세면 주민번호 뒷자리 끄트머리를 생년월일로 읽는다.
  it('주민번호 전체(13자리)는 앞 7자리를 취한다', () => {
    expect(normalizeBirth('970107-1234567')).toBe('9701071');
    expect(normalizeBirth('9701071234567')).toBe('9701071');
  });

  it('YYYYMMDD+성별(9자리)은 뒤 7자리를 취한다', () => {
    expect(normalizeBirth('199701071')).toBe('9701071');
  });

  it('가려진 주민번호와 전체 주민번호가 같은 값이 된다', () => {
    expect(normalizeBirth('970107-1234567')).toBe(normalizeBirth('9701071******'));
  });
});
