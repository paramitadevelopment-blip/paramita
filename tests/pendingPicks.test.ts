import { describe, it, expect } from 'vitest';
import {
  collectAddedRows,
  findNarrowCols,
  findUnpicked,
  buildRowAssignments,
  type PickableFile,
} from '@/lib/pendingPicks';

/**
 * 선택 대기 건 처리 검증.
 *
 * 여기가 틀리면 사람이 고른 소속이 엉뚱한 사람에게 붙거나, 안 고른 건이
 * 아무 부서에도 안 가고 조용히 사라진다. 둘 다 배포 후에는 알아채기 어렵다.
 */

/** 서울 2건 / 강원 1건이 선택 대기인 파일 */
const FILE_A: PickableFile = {
  fileName: '20260816동양생명.xlsx',
  previewHeaders: ['주문번호', '고객명', 'tel1', 'tel2', '주소'],
  pendingKeysByRegion: {
    서울: ['900001', '900002'],
    강원: ['900003'],
  },
  pendingRowsByRegion: {
    서울: [
      ['900001', '김서울', '010', '010-1111-1111', '서울시 강남구'],
      ['900002', '이서울', '010', '010-2222-2222', '서울시 마포구'],
    ],
    강원: [['900003', '박강원', '010', '010-3333-3333', '강원도 춘천시']],
  },
};

/** 인천 1건이 선택 대기인 두 번째 파일 */
const FILE_B: PickableFile = {
  fileName: '20260817동양생명.xlsx',
  previewHeaders: ['주문번호', '고객명'],
  pendingKeysByRegion: { 인천: ['900004'] },
  pendingRowsByRegion: { 인천: [['900004', '최인천']] },
};

describe('선택 반영 결과 (collectAddedRows)', () => {
  it('고른 소속별로 그 행이 들어간다', () => {
    const added = collectAddedRows(FILE_A, {
      '900001': '파라인슈1',
      '900002': '경기',
      '900003': '파라인슈1',
    });

    expect(Object.keys(added!).sort()).toEqual(['경기', '파라인슈1']);
    expect(added!['파라인슈1']).toHaveLength(2);
    expect(added!['경기']).toHaveLength(1);
  });

  it('키와 행이 같은 순서로 짝지어진다', () => {
    // 순서가 어긋나면 김서울의 선택이 이서울에게 붙는다
    const added = collectAddedRows(FILE_A, { '900002': '경기' });
    expect(added!['경기'][0][1]).toBe('이서울');
  });

  it('안 고른 건은 아무 데도 안 들어간다', () => {
    const added = collectAddedRows(FILE_A, { '900001': '경기' });
    expect(added!['경기']).toHaveLength(1);
    expect(Object.keys(added!)).toEqual(['경기']);
  });

  it('선택이 하나도 없으면 빈 객체다', () => {
    expect(collectAddedRows(FILE_A, {})).toEqual({});
    expect(collectAddedRows(FILE_A, undefined)).toEqual({});
  });

  it('파일이 없으면 null이다 — 아직 분류 전이라는 뜻', () => {
    expect(collectAddedRows(null, { '900001': '경기' })).toBeNull();
  });

  it('없는 주문번호를 골라도 다른 행에 붙지 않는다', () => {
    const added = collectAddedRows(FILE_A, { '없는번호': '경기' });
    expect(added).toEqual({});
  });
});

describe('좁게 잡을 열 (findNarrowCols)', () => {
  it('tel1만 좁게 잡는다 — tel2와 같은 번호라 앞자리면 충분하다', () => {
    expect([...findNarrowCols(FILE_A.previewHeaders!)]).toEqual([2]);
  });

  it('표기가 흔들려도 tel1을 찾는다', () => {
    expect([...findNarrowCols(['TEL1'])]).toEqual([0]);
    expect([...findNarrowCols(['tel 1'])]).toEqual([0]);
    expect([...findNarrowCols([' tel1 '])]).toEqual([0]);
  });

  it('tel2나 tel11은 건드리지 않는다', () => {
    expect([...findNarrowCols(['tel2', 'tel11', 'tel'])]).toEqual([]);
  });

  it('헤더가 없으면 빈 집합이다', () => {
    expect(findNarrowCols(undefined).size).toBe(0);
    expect(findNarrowCols([]).size).toBe(0);
  });
});

describe('아직 안 고른 건 (findUnpicked)', () => {
  it('아무것도 안 골랐으면 전부 남는다', () => {
    expect(findUnpicked([FILE_A], {})).toHaveLength(3);
  });

  it('고른 만큼 줄어든다', () => {
    const left = findUnpicked([FILE_A], { 0: { '900001': '경기', '900003': '파라인슈1' } });
    expect(left).toHaveLength(1);
    expect(left[0].region).toBe('서울');
  });

  it('전부 고르면 비어야 배포가 열린다', () => {
    const left = findUnpicked([FILE_A], {
      0: { '900001': '경기', '900002': '경기', '900003': '파라인슈1' },
    });
    expect(left).toEqual([]);
  });

  it('다른 페이지에 남은 건도 센다 — 안 그러면 그 건이 소리 없이 빠진다', () => {
    // 첫 파일은 다 골랐지만 두 번째 파일이 남아 있다
    const left = findUnpicked([FILE_A, FILE_B], {
      0: { '900001': '경기', '900002': '경기', '900003': '파라인슈1' },
    });
    expect(left).toHaveLength(1);
    expect(left[0].fileName).toBe('20260817동양생명.xlsx');
    expect(left[0].region).toBe('인천');
  });

  it('선택은 파일 번호로 갈린다 — 1번 파일 선택이 0번에 먹히면 안 된다', () => {
    const left = findUnpicked([FILE_A, FILE_B], { 1: { '900004': '경기' } });
    // FILE_A 3건은 그대로 남고 FILE_B 1건만 빠진다
    expect(left).toHaveLength(3);
    expect(left.every((u) => u.fileName === FILE_A.fileName)).toBe(true);
  });

  it('선택 대기가 없는 파일은 아무것도 안 남긴다', () => {
    expect(findUnpicked([{ fileName: '깨끗한파일.xlsx' }], {})).toEqual([]);
  });
});

describe('배포에 실을 선택 배열 (buildRowAssignments)', () => {
  it('파일 개수와 길이가 1:1로 맞는다', () => {
    const built = buildRowAssignments(3, { 0: { a: '경기' } });
    expect(built).toHaveLength(3);
  });

  it('고른 게 없는 파일도 빈 칸으로 자리를 채운다', () => {
    // 자리를 비우면 서버가 세는 순서와 어긋나 선택이 다른 파일에 붙는다
    const built = buildRowAssignments(3, { 2: { '900004': '경기' } });
    expect(built[0]).toEqual({});
    expect(built[1]).toEqual({});
    expect(built[2]).toEqual({ '900004': '경기' });
  });

  it('파일 순서를 그대로 지킨다', () => {
    const built = buildRowAssignments(2, {
      0: { '900001': '파라인슈1' },
      1: { '900004': '경기' },
    });
    expect(built).toEqual([{ '900001': '파라인슈1' }, { '900004': '경기' }]);
  });

  it('파일이 없으면 빈 배열이다', () => {
    expect(buildRowAssignments(0, { 0: { a: '경기' } })).toEqual([]);
  });

  it('화면에서 고른 건수가 그대로 실린다', () => {
    const picks = { 0: { '900001': '경기', '900002': '경기', '900003': '파라인슈1' } };
    const total = buildRowAssignments(1, picks).reduce((n, m) => n + Object.keys(m).length, 0);
    expect(total).toBe(3);
  });
});
