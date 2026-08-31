import { describe, it, expect } from 'vitest';
import {
  findLastAssignment,
  isAssignedRecord,
  type AssignmentRecord,
} from '@/lib/lastAssignment';

/**
 * 재신청 고객을 누구에게 알릴지.
 *
 * 30일 중복으로 매칭된 그 행이 자기도 '중복 제외'였을 수 있다. 그러면 알려줄
 * 지사가 없다. 그래서 매칭된 행이 아니라, 그 사람의 과거 기록 중 실제로 배정된
 * 가장 최근 건을 따로 찾는다.
 */

const now = new Date(2026, 7, 26);
const daysAgo = (n: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
};

const rec = (o: Partial<AssignmentRecord> = {}): AssignmentRecord => ({
  name: '홍길동',
  tel1: '010-1111-2222',
  tel2: '010-1111-2222',
  assignedTo: '파라인슈1',
  uploadedAt: daysAgo(10),
  fileId: 'f1',
  fileName: '과거.xlsx',
  ...o,
});

const 이번건 = rec({ assignedTo: '', uploadedAt: now });

describe('배정된 행인가', () => {
  it('지사 이름이면 배정된 것', () => {
    expect(isAssignedRecord(rec({ assignedTo: '파라인슈1' }))).toBe(true);
    expect(isAssignedRecord(rec({ assignedTo: '굿모닝제너럴' }))).toBe(true);
  });

  it('중복 제외·블랙리스트·오류·빈값은 배정된 게 아니다', () => {
    for (const value of ['중복 제외', '블랙리스트', '오류', '']) {
      expect(isAssignedRecord(rec({ assignedTo: value }))).toBe(false);
    }
  });
});

describe('직전 배정 찾기', () => {
  it('가장 최근에 배정된 건을 고른다', () => {
    const past = [
      rec({ assignedTo: '경기', uploadedAt: daysAgo(30) }),
      rec({ assignedTo: '파라인슈1', uploadedAt: daysAgo(5) }),
      rec({ assignedTo: '한울부원', uploadedAt: daysAgo(20) }),
    ];

    expect(findLastAssignment(이번건, past)?.dept).toBe('파라인슈1');
  });

  /**
   * 이게 이 함수가 있는 이유다. 매칭된 행을 그대로 쓰면 '중복 제외'가 나온다.
   *
   *   8/01  파라인슈1 배정
   *   8/15  중복 제외      ← 30일 중복은 이 행에 걸린다
   *   8/26  중복 제외      ← 이번 건
   */
  it('중복 제외로 빠진 건은 건너뛰고 그 앞의 배정 건을 찾는다', () => {
    const past = [
      rec({ assignedTo: '파라인슈1', uploadedAt: daysAgo(25) }),
      rec({ assignedTo: '중복 제외', uploadedAt: daysAgo(11) }),
    ];

    const got = findLastAssignment(이번건, past);

    expect(got?.dept).toBe('파라인슈1');
    expect(got?.at).toEqual(daysAgo(25));
  });

  it('블랙리스트로 빠진 건도 건너뛴다', () => {
    const past = [
      rec({ assignedTo: '경기', uploadedAt: daysAgo(40) }),
      rec({ assignedTo: '블랙리스트', uploadedAt: daysAgo(2) }),
    ];

    expect(findLastAssignment(이번건, past)?.dept).toBe('경기');
  });

  it('배정된 적이 아예 없으면 null — 알릴 지사가 없다', () => {
    const past = [
      rec({ assignedTo: '중복 제외', uploadedAt: daysAgo(5) }),
      rec({ assignedTo: '블랙리스트', uploadedAt: daysAgo(2) }),
    ];

    expect(findLastAssignment(이번건, past)).toBeNull();
  });

  it('과거가 비면 null', () => {
    expect(findLastAssignment(이번건, [])).toBeNull();
  });

  /**
   * 접수일자가 같다고 "같은 신청서가 두 번 들어온 것"으로 단정하지 않는다.
   * past는 이미 별도 업로드에서 온 행이라, 날짜가 같아도 실제로는 다시 신청한
   * 것일 수 있다 — 알려줄 지사가 있으면 알린다.
   */
  it('접수일자가 같아도 직전 배정으로 인정한다', () => {
    const past = [rec({ assignedTo: '경기', uploadedAt: now, receivedAt: now })];
    const 같은날신청 = rec({ assignedTo: '', uploadedAt: now, receivedAt: now });

    expect(findLastAssignment(같은날신청, past)?.dept).toBe('경기');
  });

  it('나중에 신청된 건은 직전 배정으로 안 본다', () => {
    const past = [rec({ assignedTo: '경기', uploadedAt: daysAgo(-1), receivedAt: daysAgo(-1) })];

    expect(findLastAssignment(이번건, past)).toBeNull();
  });

  /**
   * 엑셀 일련번호를 문자열로 저장했다 다시 읽으면 같은 날짜인데도 시각이
   * 몇십 초 어긋난다(1899년 서울 표준시 52초 오차, lib/excelCell.ts 참고).
   * 시각까지 비교하면 그 오차 때문에 "같은 날"인데 "나중"으로 잘못 걸러진다.
   */
  it('같은 날짜라도 시각이 몇 초 어긋나면 직전 배정으로 인정한다', () => {
    const 같은날_52초뒤 = new Date(now);
    같은날_52초뒤.setSeconds(52);
    const past = [rec({ assignedTo: '경기', uploadedAt: now, receivedAt: 같은날_52초뒤 })];
    const 오늘신청 = rec({ assignedTo: '', uploadedAt: now, receivedAt: now });

    expect(findLastAssignment(오늘신청, past)?.dept).toBe('경기');
  });

  it('어느 파일의 어느 날 건인지 함께 돌려준다', () => {
    const past = [rec({ fileId: 'abc', fileName: '8월.xlsx', uploadedAt: daysAgo(7) })];

    const got = findLastAssignment(이번건, past);

    expect(got?.fileId).toBe('abc');
    expect(got?.fileName).toBe('8월.xlsx');
    expect(got?.at).toEqual(daysAgo(7));
  });
});

/**
 * 같은 사람인지는 이름 + 번호 겹침으로 본다. 30일 중복 판정과 같은 기준이다 —
 * 여기서만 다르면 "중복이라 뺐다"와 "누구에게 알린다"가 서로 다른 사람을 가리킨다.
 */
describe('누구를 같은 사람으로 보는가', () => {
  it('Tel1과 Tel2가 뒤바뀌어도 같은 사람', () => {
    const past = [rec({ tel1: '010-9999-9999', tel2: '010-1111-2222' })];

    expect(findLastAssignment(이번건, past)?.dept).toBe('파라인슈1');
  });

  it('이름이 다르면 다른 사람 — 번호가 같아도 안 엮는다', () => {
    const past = [rec({ name: '김철수' })];

    expect(findLastAssignment(이번건, past)).toBeNull();
  });

  it('번호가 하나도 안 겹치면 다른 사람', () => {
    const past = [rec({ tel1: '010-8888-8888', tel2: '010-8888-8888' })];

    expect(findLastAssignment(이번건, past)).toBeNull();
  });

  it('이름 표기가 흔들려도 같은 사람으로 본다', () => {
    const past = [rec({ name: ' 홍길동 ' })];

    expect(findLastAssignment(이번건, past)?.dept).toBe('파라인슈1');
  });

  it('번호가 없으면 판정하지 않는다', () => {
    const 무번호 = rec({ tel1: '', tel2: '', assignedTo: '', uploadedAt: now });

    expect(findLastAssignment(무번호, [rec()])).toBeNull();
  });
});
