import { describe, it, expect } from 'vitest';
import { REGIONS } from '@/lib/assignmentRegions';
import { batchCountsByDept, mergeTodayTotals, emptyCounts } from '@/lib/todayTotals';

const depts = [
  { id: 1, name: '파라인슈' },
  { id: 2, name: '한울부원' },
  { id: 3, name: '경기' },
];
const region = REGIONS[0];

// 흥국 파일: 규칙이 파라인슈 3·한울부원 2, 그중 a는 파라인슈로 간 건. p1은 지역을 못 정한 미정 건.
const hk: any = {
  fileName: '흥국.xlsx',
  insurerType: 'hk',
  classificationByDeptId: { 1: 3, 2: 2 },
  assignedRows: [{ key: 'a', dept: '파라인슈', row: ['a'] }],
  pendingKeysByRegion: { [region]: ['p1'] },
  pendingRowsByRegion: { [region]: [['p1']] },
};
const dy: any = { fileName: '동양.xlsx', insurerType: 'dy', classificationByDeptId: { 1: 4, 3: 1 } };

describe('이번 배포 건수', () => {
  it('파일마다 보험사로 나눠 지사별로 합친다', () => {
    expect(batchCountsByDept([hk, dy], {}, depts)).toEqual({
      파라인슈: { hk: 3, dy: 4, etc: 0 },
      한울부원: { hk: 2, dy: 0, etc: 0 },
      경기: { hk: 0, dy: 1, etc: 0 },
    });
  });

  it('사람이 고르고 옮긴 것까지 반영한다 — 선택 반영 칸과 같은 셈', () => {
    const got = batchCountsByDept([hk, dy], { 0: { p1: '한울부원', a: '한울부원' } }, depts);
    expect(got['파라인슈']).toEqual({ hk: 2, dy: 4, etc: 0 });
    expect(got['한울부원']).toEqual({ hk: 4, dy: 0, etc: 0 });
  });

  it('규칙과 같은 소속을 고른 건 옮긴 게 아니다', () => {
    expect(batchCountsByDept([hk], { 0: { a: '파라인슈' } }, depts)['파라인슈'].hk).toBe(3);
  });

  it('고르지 않은 미정 건은 세지 않는다 — 배포되지 않는다', () => {
    const total = Object.values(batchCountsByDept([hk], {}, depts)).reduce((n, c) => n + c.hk, 0);
    expect(total).toBe(5);
  });

  it('보험사를 못 가린 파일은 etc 로 센다', () => {
    expect(batchCountsByDept([{ ...dy, insurerType: null }], {}, depts)['파라인슈']).toEqual({
      hk: 0,
      dy: 0,
      etc: 4,
    });
  });

  it('선택은 파일 순서로 따로 간다 — 두 번째 파일 선택이 첫 파일에 붙지 않는다', () => {
    const got = batchCountsByDept([hk, { ...hk, fileName: '흥국2.xlsx' }], { 1: { p1: '경기' } }, depts);
    expect(got['경기']).toEqual({ hk: 1, dy: 0, etc: 0 });
  });
});

describe('표 줄 합치기', () => {
  it('오늘 배포분과 이번 배포분을 소속별로 나란히 둔다', () => {
    const rows = mergeTodayTotals(
      ['파라인슈', '한울부원'],
      [{ department: '파라인슈', byInsurer: { hk: 10, dy: 3, etc: 0 } }],
      { 한울부원: { hk: 2, dy: 0, etc: 0 } }
    );
    expect(rows).toEqual([
      { department: '파라인슈', done: { hk: 10, dy: 3, etc: 0 }, batch: emptyCounts() },
      { department: '한울부원', done: emptyCounts(), batch: { hk: 2, dy: 0, etc: 0 } },
    ]);
  });

  it('목록에 없는 소속도 빼지 않고 뒤에 붙인다 — 합계가 실제와 맞아야 한다', () => {
    const rows = mergeTodayTotals(
      ['파라인슈'],
      [{ department: '소속 없음', byInsurer: { hk: 1, dy: 0, etc: 0 } }],
      {}
    );
    expect(rows.map((r) => r.department)).toEqual(['파라인슈', '소속 없음']);
  });
});
