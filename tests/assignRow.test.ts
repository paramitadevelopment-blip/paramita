import { describe, it, expect } from 'vitest';
import {
  assignRow,
  resolveDeptName,
  calculateInsuranceAge,
  type DepartmentIndex,
} from '@/lib/insurance';
import type { DepartmentRule } from '@/lib/assignmentRules';

/**
 * 한 행을 어디로 보낼지.
 *
 * 예전에는 규칙이 코드에 박혀 있었지만 이제 설정값이다. 그래서 여기서 보는 건
 * "설정을 이렇게 두면 이렇게 간다"이지 특정 지사의 담당 지역이 아니다.
 *
 * 조용히 사라지는 건이 없어야 한다는 게 요점이다 — 아무도 안 맡은 조합도,
 * 여럿이 맡은 조합도 사람이 고르는 목록으로 나와야 한다.
 */

/** 실제 소속 구성. 파라인슈만 분류가 둘로 나뉜다. */
const INDEX: DepartmentIndex = {
  경기: ['경기'],
  굿모닝제너럴: ['굿모닝제너럴'],
  한울부원: ['한울부원'],
  파라인슈: ['파라인슈1', '파라인슈2'],
};

const RULES: DepartmentRule[] = [
  { group: '경기', regions: ['서울'], ageBrackets: ['under70'] },
  { group: '굿모닝제너럴', regions: ['서울'], ageBrackets: ['70to75'] },
  { group: '한울부원', regions: ['부산'], ageBrackets: ['under70', '70to75', 'over75'] },
  { group: '파라인슈', regions: ['제주'], ageBrackets: ['under70', '70to75', 'over75'] },
];

/**
 * 그 보험나이가 되는 주민번호 앞자리를 만든다.
 *
 * 보험나이는 생일까지 남은 개월로 반올림해서 만나이와 한 살 어긋난다.
 * 그 규칙을 여기에 베껴 쓰면 규칙이 바뀔 때 테스트도 같이 틀리므로,
 * 실제 계산에 물어보며 맞는 해를 찾는다.
 */
function juminForAge(age: number): string {
  const thisYear = new Date().getFullYear();
  for (const delta of [0, -1, 1, -2, 2]) {
    const jumin = `${String(thisYear - age + delta).slice(2)}0101-1`;
    if (calculateInsuranceAge(jumin) === age) return jumin;
  }
  throw new Error(`보험나이 ${age}세가 되는 주민번호를 만들지 못했다`);
}

describe('규칙이 하나로 정해지면 자동배정', () => {
  it('서울 + 70세 미만 → 경기', () => {
    const result = assignRow(juminForAge(50), '서울 강남구', RULES, INDEX);
    expect(result).toEqual({ kind: 'dept', dept: '경기' });
  });

  it('서울 + 70~75세 → 굿모닝제너럴', () => {
    const result = assignRow(juminForAge(72), '서울 강남구', RULES, INDEX);
    expect(result).toEqual({ kind: 'dept', dept: '굿모닝제너럴' });
  });
});

/**
 * 나뉜 조직은 나이로 분류를 고른다. 파일은 분류 단위로 만들어지므로
 * 조직 이름만으로는 어느 파일에 담을지 정할 수 없다.
 */
describe('나뉜 조직은 나이로 분류가 갈린다', () => {
  it('70세 미만은 파라인슈1', () => {
    expect(assignRow(juminForAge(40), '제주 제주시', RULES, INDEX)).toEqual({
      kind: 'dept',
      dept: '파라인슈1',
    });
  });

  it('70세 이상은 파라인슈2', () => {
    expect(assignRow(juminForAge(80), '제주 제주시', RULES, INDEX)).toEqual({
      kind: 'dept',
      dept: '파라인슈2',
    });
  });

  it('분류가 하나뿐인 조직은 나이와 무관하게 그 이름', () => {
    expect(resolveDeptName(INDEX, '경기', 30)).toBe('경기');
    expect(resolveDeptName(INDEX, '경기', 90)).toBe('경기');
  });

  it('없는 조직이면 null — 조용히 아무 데나 보내지 않는다', () => {
    expect(resolveDeptName(INDEX, '없는소속', 50)).toBeNull();
  });
});

describe('여럿이 맡은 조합은 사람이 고른다', () => {
  it('후보를 모두 돌려준다', () => {
    const overlapping: DepartmentRule[] = [
      { group: '경기', regions: ['서울'], ageBrackets: ['under70'] },
      { group: '한울부원', regions: ['서울'], ageBrackets: ['under70'] },
    ];
    const result = assignRow(juminForAge(50), '서울 강남구', overlapping, INDEX);

    expect(result.kind).toBe('select');
    if (result.kind !== 'select') return;
    expect(result.reason).toBe('multiple');
    expect(result.choices).toEqual(['경기', '한울부원']);
    expect(result.region).toBe('서울');
  });

  /** 후보는 조직이 아니라 분류로 좁혀서 내려간다 — 화면에서 고른 그대로 파일이 만들어져야 한다. */
  it('나뉜 조직은 후보도 나이에 맞는 분류로 나온다', () => {
    const overlapping: DepartmentRule[] = [
      { group: '경기', regions: ['제주'], ageBrackets: ['over75'] },
      { group: '파라인슈', regions: ['제주'], ageBrackets: ['over75'] },
    ];
    const result = assignRow(juminForAge(80), '제주 제주시', overlapping, INDEX);

    expect(result.kind).toBe('select');
    if (result.kind !== 'select') return;
    expect(result.choices).toContain('파라인슈2');
    expect(result.choices).not.toContain('파라인슈1');
    expect(result.choices).not.toContain('파라인슈');
  });
});

/**
 * 지역은 맡았는데 나이가 안 맞는 건 = 남는 DB.
 * 이걸 버리면 그 사람에게 아무도 연락하지 않게 된다.
 */
describe('아무도 안 맡은 조합은 예외로 빠진다', () => {
  it('나이가 안 맞으면 예외', () => {
    // 서울은 70세 미만(경기)·70~75세(굿모닝)만 맡았다. 75세 이상은 빈자리다.
    const result = assignRow(juminForAge(80), '서울 강남구', RULES, INDEX);

    expect(result.kind).toBe('select');
    if (result.kind !== 'select') return;
    expect(result.reason).toBe('unmatched');
    expect(result.region).toBe('서울');
  });

  it('아무도 안 맡은 지역도 예외', () => {
    const result = assignRow(juminForAge(50), '대전 유성구', RULES, INDEX);
    expect(result.kind).toBe('select');
    if (result.kind !== 'select') return;
    expect(result.reason).toBe('unmatched');
  });

  it('예외는 배정 가능한 소속 전체가 후보로 나온다', () => {
    const result = assignRow(juminForAge(50), '대전 유성구', RULES, INDEX);
    if (result.kind !== 'select') throw new Error('select여야 한다');
    expect(result.choices).toContain('경기');
    expect(result.choices).toContain('한울부원');
    // 나이에 맞는 분류 하나만 나온다
    expect(result.choices).toContain('파라인슈1');
    expect(result.choices).not.toContain('파라인슈2');
  });

  it('설정이 아예 없으면 전부 예외로 빠진다 — 배포가 막히지 조용히 나가지 않는다', () => {
    const result = assignRow(juminForAge(50), '서울 강남구', [], INDEX);
    expect(result.kind).toBe('select');
  });
});

/**
 * 주소를 못 읽으면 지역 설정에 걸릴 수가 없다.
 * 예전에는 '이외지역'에 쌓아 두고 사람이 나눴는데, 이제 파라인슈가 받는다.
 */
describe('주소를 못 읽으면 파라인슈', () => {
  it('빈 주소', () => {
    expect(assignRow(juminForAge(50), '', RULES, INDEX)).toEqual({
      kind: 'dept',
      dept: '파라인슈1',
    });
  });

  it('시·도가 아닌 값', () => {
    expect(assignRow(juminForAge(50), '어딘가 알 수 없는 곳', RULES, INDEX)).toEqual({
      kind: 'dept',
      dept: '파라인슈1',
    });
  });

  /** 경기인 건 알지만 시·군을 모르면 북·남을 찍을 수 없다. */
  it('경기인데 시·군을 모르면 파라인슈', () => {
    expect(assignRow(juminForAge(50), '경기도', RULES, INDEX)).toEqual({
      kind: 'dept',
      dept: '파라인슈1',
    });
  });

  /** 조직이 나뉘어 있으면 다른 배정과 똑같이 나이로 하위 분류를 가른다. */
  it('나뉜 조직이면 나이로 분류가 갈린다', () => {
    expect(assignRow(juminForAge(80), '', RULES, INDEX)).toEqual({
      kind: 'dept',
      dept: '파라인슈2',
    });
  });

  /*
   * 파라인슈가 사라진 경우. 갈 곳이 없다고 버리면 그 건은 아무 파일에도
   * 안 담기고 조용히 사라지므로, 예전처럼 한곳에 모아 사람 눈에 띄게 한다.
   */
  it('파라인슈가 없으면 이외지역으로 모은다', () => {
    const withoutParain: DepartmentIndex = { 경기: ['경기'], 한울부원: ['한울부원'] };
    expect(assignRow(juminForAge(50), '', RULES, withoutParain)).toEqual({
      kind: 'dept',
      dept: '이외지역',
    });
  });
});

describe('생년월일을 못 읽으면 오류', () => {
  it('나이를 모르면 어느 구간인지도 모른다', () => {
    const result = assignRow('없는값', '서울 강남구', RULES, INDEX);
    expect(result).toEqual({ kind: 'error', reason: '생년월일 형식 오류' });
  });
});

/**
 * 상담메모 규칙은 "언제 연락해야 하는가"라서 누가 그 지역을 맡았는지와 무관하다.
 * 지역 설정보다 먼저 걸린다.
 */
describe('상담메모 규칙이 지역 설정보다 먼저 걸린다', () => {
  const NOW = new Date(2026, 8, 2, 9, 0, 0);

  it('오늘 11시 이전 상담이면 지역과 무관하게 파라인슈로 간다', () => {
    const result = assignRow(juminForAge(50), '부산 해운대구', RULES, INDEX, {
      memo: '2026-09-02 10:00:00',
      now: NOW,
    });
    expect(result).toEqual({ kind: 'dept', dept: '파라인슈1' });
  });

  it('그 안에서도 나이로 분류가 갈린다', () => {
    const result = assignRow(juminForAge(80), '부산 해운대구', RULES, INDEX, {
      memo: '2026-09-02 10:00:00',
      now: NOW,
    });
    expect(result).toEqual({ kind: 'dept', dept: '파라인슈2' });
  });

  it('11시 이후 상담이면 규칙이 안 걸리고 지역 설정을 탄다', () => {
    const result = assignRow(juminForAge(50), '부산 해운대구', RULES, INDEX, {
      memo: '2026-09-02 14:00:00',
      now: NOW,
    });
    expect(result).toEqual({ kind: 'dept', dept: '한울부원' });
  });
});
