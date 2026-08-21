import { describe, it, expect } from 'vitest';
import { assignRow, assignByAddress, calculateInsuranceAge } from '@/lib/insurance';

/**
 * 배정 규칙 검증.
 * 이 로직이 틀리면 고객 데이터가 엉뚱한 부서로 나가고, 나간 뒤에는 되돌릴 수 없다.
 * 규칙은 lib/insurance.ts의 assignRow에 있다.
 */

/** 기준일을 고정한다. '오늘'에 따라 나이가 흔들리면 테스트가 날짜마다 달라진다. */
const BASE = new Date(2026, 7, 20); // 2026-08-20

/**
 * 원하는 보험나이가 나오는 주민번호 앞자리를 만든다.
 * 보험나이는 만나이에 "마지막 생일로부터 6개월 경과 시 +1"이 붙으므로,
 * 생일을 기준일과 같은 달·일로 잡아 만나이와 보험나이를 일치시킨다.
 */
function juminForAge(age: number): string {
  const birthYear = BASE.getFullYear() - age;
  const yy = String(birthYear % 100).padStart(2, '0');
  const mm = String(BASE.getMonth() + 1).padStart(2, '0');
  const dd = String(BASE.getDate()).padStart(2, '0');
  // 1900년대생 남성(1). 1926년 이후 출생만 다루므로 문제없다.
  return `${yy}${mm}${dd}1`;
}

describe('보험나이 계산', () => {
  it('생일 당일이면 만나이와 같다', () => {
    expect(calculateInsuranceAge(juminForAge(70), BASE)).toBe(70);
    expect(calculateInsuranceAge(juminForAge(69), BASE)).toBe(69);
  });

  it('형식이 깨지면 -1을 준다', () => {
    expect(calculateInsuranceAge('', BASE)).toBe(-1);
    expect(calculateInsuranceAge('12345', BASE)).toBe(-1); // 7자리 미만
    expect(calculateInsuranceAge('abcdefg', BASE)).toBe(-1); // 숫자 아님
    expect(calculateInsuranceAge('9913011', BASE)).toBe(-1); // 13월
    expect(calculateInsuranceAge('9902301', BASE)).toBe(-1); // 2월 30일
  });

  it('성별코드로 세기를 가른다', () => {
    // 같은 YYMMDD라도 코드가 1이면 1900년대, 3이면 2000년대
    const y1900 = calculateInsuranceAge('9001011', BASE);
    const y2000 = calculateInsuranceAge('9001013', BASE);
    expect(y1900).toBeGreaterThan(y2000);
  });
});

describe('주소 배정 (나이 무관)', () => {
  it.each([
    ['부산 해운대구', '한울부원'],
    ['울산 남구', '한울부원'],
    ['경남 창원시', '한울부원'],
    ['대구 수성구', '한울부원'],
    ['전남 여수시', '경기'],
    ['광주 북구', '경기'],
    ['경북 포항시', '굿모닝제너럴'],
    ['충남 천안시', '파라인슈1'],
    ['세종 어진동', '파라인슈1'],
    ['제주 서귀포시', '파라인슈1'],
  ])('%s → %s', (address, dept) => {
    expect(assignByAddress(address)).toEqual({ kind: 'dept', dept });
  });

  it.each([
    ['서울 강남구', '서울'],
    ['경기도 성남시', '경기'],
    ['인천 연수구', '인천'],
    ['강원 춘천시', '강원'],
  ])('%s → 사람이 고르는 지역(%s)', (address, region) => {
    expect(assignByAddress(address)).toEqual({ kind: 'select', region });
  });

  it('시·도를 못 읽으면 이외지역으로 보낸다', () => {
    expect(assignByAddress('')).toEqual({ kind: 'dept', dept: '이외지역' });
    expect(assignByAddress(null)).toEqual({ kind: 'dept', dept: '이외지역' });
    expect(assignByAddress('어딘가 알 수 없는 곳')).toEqual({ kind: 'dept', dept: '이외지역' });
  });

  it("부서명 '경기'와 지역 '경기'는 다른 결과다", () => {
    // 전남 → 업체 '경기'(dept), 경기도 → 사람이 고르는 지역 '경기'(select).
    // 둘이 뒤섞이면 전라도 건이 경기도 담당에게 간다.
    const jeonnam = assignByAddress('전남 순천시');
    const gyeonggi = assignByAddress('경기도 수원시');
    expect(jeonnam.kind).toBe('dept');
    expect(gyeonggi.kind).toBe('select');
  });
});

describe('흥국(hk): 70세 하나로 가른다', () => {
  it('70세 이상은 주소와 무관하게 파라인슈2', () => {
    expect(assignRow('hk', juminForAge(70), '부산 해운대구')).toEqual({
      kind: 'dept', dept: '파라인슈2',
    });
    expect(assignRow('hk', juminForAge(85), '서울 강남구')).toEqual({
      kind: 'dept', dept: '파라인슈2',
    });
  });

  it('70세 미만은 주소로 배정한다', () => {
    expect(assignRow('hk', juminForAge(69), '부산 해운대구')).toEqual({
      kind: 'dept', dept: '한울부원',
    });
    expect(assignRow('hk', juminForAge(30), '서울 강남구')).toEqual({
      kind: 'select', region: '서울',
    });
  });
});

describe('동양(dy): 70세와 75세, 둘로 가른다', () => {
  it('70~75세 구간만 주소를 본다', () => {
    // 이 구간에서 부산·울산·경남·대구는 한울부원으로 빠진다
    expect(assignRow('dy', juminForAge(72), '부산 해운대구')).toEqual({
      kind: 'dept', dept: '한울부원',
    });
    // 그 밖의 읽히는 주소는 파라인슈2
    expect(assignRow('dy', juminForAge(72), '서울 강남구')).toEqual({
      kind: 'dept', dept: '파라인슈2',
    });
    // 못 읽는 주소는 이외지역
    expect(assignRow('dy', juminForAge(72), '알 수 없음')).toEqual({
      kind: 'dept', dept: '이외지역',
    });
  });

  it('75세 이상은 주소와 무관하게 파라인슈2', () => {
    expect(assignRow('dy', juminForAge(75), '부산 해운대구')).toEqual({
      kind: 'dept', dept: '파라인슈2',
    });
    expect(assignRow('dy', juminForAge(90), '알 수 없음')).toEqual({
      kind: 'dept', dept: '파라인슈2',
    });
  });

  it('70세 미만은 흥국과 같다', () => {
    expect(assignRow('dy', juminForAge(69), '부산 해운대구')).toEqual(
      assignRow('hk', juminForAge(69), '부산 해운대구')
    );
    expect(assignRow('dy', juminForAge(40), '경북 포항시')).toEqual(
      assignRow('hk', juminForAge(40), '경북 포항시')
    );
  });

  it('경계값: 69/70/74/75에서 규칙이 바뀌는 지점을 짚는다', () => {
    // 69 → 주소 기준(한울부원), 70~74 → 주소 보되 부산은 한울부원, 75 → 무조건 파라인슈2
    expect(assignRow('dy', juminForAge(69), '서울 강남구')).toEqual({ kind: 'select', region: '서울' });
    expect(assignRow('dy', juminForAge(70), '서울 강남구')).toEqual({ kind: 'dept', dept: '파라인슈2' });
    expect(assignRow('dy', juminForAge(74), '부산 해운대구')).toEqual({ kind: 'dept', dept: '한울부원' });
    expect(assignRow('dy', juminForAge(75), '부산 해운대구')).toEqual({ kind: 'dept', dept: '파라인슈2' });
  });
});

describe('생년월일이 깨진 행', () => {
  it('배정하지 않고 오류로 표시한다', () => {
    // 조용히 아무 부서로 보내면 잘못 나간 걸 나중에 못 찾는다
    expect(assignRow('dy', '', '부산')).toEqual({
      kind: 'error', reason: '생년월일 형식 오류',
    });
    expect(assignRow('hk', 'XXXXXXX', '서울')).toEqual({
      kind: 'error', reason: '생년월일 형식 오류',
    });
  });
});

describe('상담메모 규칙 (켰을 때)', () => {
  const now = new Date(2026, 7, 20, 14, 0, 0); // 2026-08-20 14:00

  it('예정 시각이 오늘 11시보다 앞이면 나이로만 가른다', () => {
    // 주소가 부산이어도 한울부원으로 가지 않고 파라 계열로 몰린다
    expect(
      assignRow('dy', juminForAge(50), '부산 해운대구', { memo: '2026-08-20 09:30', now })
    ).toEqual({ kind: 'dept', dept: '파라인슈1' });

    expect(
      assignRow('dy', juminForAge(72), '부산 해운대구', { memo: '2026-08-20 09:30', now })
    ).toEqual({ kind: 'dept', dept: '파라인슈2' });
  });

  it('지난 날짜면 시각과 무관하게 걸린다', () => {
    expect(
      assignRow('hk', juminForAge(50), '서울 강남구', { memo: '2026-08-12 23:59', now })
    ).toEqual({ kind: 'dept', dept: '파라인슈1' });
  });

  it('오늘 11시 이후 예정이면 규칙이 걸리지 않는다', () => {
    // 평소 규칙대로 주소를 본다
    expect(
      assignRow('hk', juminForAge(50), '부산 해운대구', { memo: '2026-08-20 15:00', now })
    ).toEqual({ kind: 'dept', dept: '한울부원' });
  });

  it('메모가 비었거나 날짜가 없으면 규칙이 걸리지 않는다', () => {
    expect(
      assignRow('hk', juminForAge(50), '부산 해운대구', { memo: '', now })
    ).toEqual({ kind: 'dept', dept: '한울부원' });
    expect(
      assignRow('hk', juminForAge(50), '부산 해운대구', { memo: '전화함', now })
    ).toEqual({ kind: 'dept', dept: '한울부원' });
  });

  it('규칙을 끄면(memoRule 미전달) 메모가 있어도 무시한다', () => {
    expect(assignRow('hk', juminForAge(50), '부산 해운대구')).toEqual({
      kind: 'dept', dept: '한울부원',
    });
  });
});
