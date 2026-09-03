import { describe, it, expect } from 'vitest';
import {
  collectAddedRows,
  findUnpicked,
  buildRowAssignments,
  buildBaseCounts,
  clearPicksInScope,
  keysInScope,
  regionsInScope,
  summarizePendingReasons,
  ALL_SCOPE,
  pickAllInScope,
  commonChoicesInScope,
  scopeKey,
  rowsInScope,
  type SummarizableFile,
  type PickableFile,
} from '@/lib/pendingPicks';
import { autoDistributePending } from '@/lib/insurance';

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

/**
 * 자동선택·직접선택이 미치는 범위.
 *
 * 지역 탭을 보고 있을 때 누른 자동선택이 전 지역에 걸리면, 다른 탭에서 손으로
 * 고른 것을 덮어써 놓고 화면에는 그 탭만 보여 준다 — 무엇이 바뀌었는지
 * 알 방법이 없이 배포된다.
 */
describe('선택 범위 (지역 탭)', () => {
  it('지역 탭이면 그 지역 키만 범위에 든다', () => {
    expect([...keysInScope(FILE_A, { region: '서울', reason: 'all' })]).toEqual(['900001', '900002']);
    expect([...keysInScope(FILE_A, { region: '강원', reason: 'all' })]).toEqual(['900003']);
  });

  it('전체 탭이면 모든 지역이 범위에 든다', () => {
    expect([...keysInScope(FILE_A, ALL_SCOPE)].sort()).toEqual(['900001', '900002', '900003']);
  });

  it('지역 탭이면 그 지역만, 전체 탭이면 18개 지역 전부를 훑는다', () => {
    expect(regionsInScope({ region: '강원', reason: 'all' })).toEqual(['강원']);
    expect(regionsInScope(ALL_SCOPE)).toHaveLength(18);
  });

  it('없는 파일이나 건이 없는 지역은 빈 범위다', () => {
    expect(keysInScope(null, ALL_SCOPE).size).toBe(0);
    expect(keysInScope(FILE_A, { region: '제주', reason: 'all' }).size).toBe(0);
  });
});

describe('범위 밖 선택은 지키고 세어 준다', () => {
  it('직접선택으로 되돌려도 다른 지역 선택은 남는다', () => {
    const picks = { '900001': '경기', '900002': '경기', '900003': '한울부원' };

    // 서울 탭에서 직접선택을 누른 상황
    const next = clearPicksInScope(picks, keysInScope(FILE_A, { region: '서울', reason: 'all' }));

    expect(next).toEqual({ '900003': '한울부원' });
  });

  it('전체 탭에서 직접선택을 누르면 전부 지운다', () => {
    const picks = { '900001': '경기', '900003': '한울부원' };
    expect(clearPicksInScope(picks, keysInScope(FILE_A, ALL_SCOPE))).toEqual({});
  });

  /*
   * 지역별로 나눠 자동선택을 돌릴 때 매번 0에서 시작하면, 앞 탭에서 이미
   * 많이 받은 소속에 또 몰아준다. 범위 밖 선택도 세어야 전체가 고르게 된다.
   */
  it('자동 배분의 출발점에 범위 밖 선택이 더해진다', () => {
    const ruleCounts = { 경기: 5, 한울부원: 2 };
    const picks = { '900001': '경기', '900003': '한울부원' };

    // 서울 탭을 다시 채우는 중 — 900001은 이번에 덮어쓸 것이라 세지 않는다
    const base = buildBaseCounts(ruleCounts, picks, keysInScope(FILE_A, { region: '서울', reason: 'all' }));

    expect(base).toEqual({ 경기: 5, 한울부원: 3 });
  });

  it('규칙 배정이 없어도 범위 밖 선택만으로 센다', () => {
    const base = buildBaseCounts(undefined, { '900003': '한울부원' }, keysInScope(FILE_A, { region: '서울', reason: 'all' }));
    expect(base).toEqual({ 한울부원: 1 });
  });

  it('전체 탭이면 전부 다시 채우므로 규칙 배정만 남는다', () => {
    const picks = { '900001': '경기', '900003': '한울부원' };
    const base = buildBaseCounts({ 경기: 5 }, picks, keysInScope(FILE_A, ALL_SCOPE));
    expect(base).toEqual({ 경기: 5 });
  });
});

/**
 * 사용자가 겪은 순서 그대로.
 *
 * "경기남부를 선택하고 자동선택을 누르면 이 탭에서만 적용되어야 하는데
 *  전체에 자동선택이 적용되어 있다."
 *
 * 훅(usePendingPicks)이 이 함수들을 이 순서로 쓴다. 여기가 깨지면
 * 다른 탭에서 손으로 고른 것이 말없이 덮어써진 채로 배포된다.
 */
describe('시나리오: 지역 탭을 오가며 고르기', () => {
  /** 서울 2건 · 경기남부 2건이 수동배정인 파일 */
  const FILE: PickableFile = {
    fileName: '두지역.xlsx',
    pendingKeysByRegion: { 서울: ['S1', 'S2'], 경기남부: ['G1', 'G2'] },
    pendingRowsByRegion: { 서울: [[], []], 경기남부: [[], []] },
  };

  const CHOICES: Record<string, string[]> = {
    S1: ['경기', '한울부원'],
    S2: ['경기', '한울부원'],
    G1: ['경기', '굿모닝제너럴'],
    G2: ['경기', '굿모닝제너럴'],
  };

  /** 훅의 applyAutoDistribute와 같은 순서 */
  const autoFill = (scope: Parameters<typeof keysInScope>[1], before: Record<string, string>) => {
    const scopeKeys = keysInScope(FILE, scope);
    const pending = regionsInScope(scope).flatMap((region) =>
      (FILE.pendingKeysByRegion?.[region] ?? []).map((key) => ({
        key,
        region,
        jumin: '800101-1******',
        choices: CHOICES[key],
      }))
    );
    const base = buildBaseCounts({}, before, scopeKeys);
    return { ...before, ...autoDistributePending(pending, base) };
  };

  it('경기남부 탭 자동선택은 서울 탭 선택을 건드리지 않는다', () => {
    // 서울 탭에서 손으로 둘 다 한울부원으로 골랐다
    const afterManual = { S1: '한울부원', S2: '한울부원' };

    // 경기남부 탭으로 옮겨 자동선택
    const afterAuto = autoFill({ region: '경기남부', reason: 'all' }, afterManual);

    // 서울은 그대로여야 한다 — 예전에는 여기서 통째로 덮어써졌다
    expect(afterAuto.S1).toBe('한울부원');
    expect(afterAuto.S2).toBe('한울부원');
    // 경기남부만 새로 채워진다
    expect(afterAuto.G1).toBeTruthy();
    expect(afterAuto.G2).toBeTruthy();
  });

  it('경기남부에는 경기남부가 고를 수 있는 소속만 들어간다', () => {
    const afterAuto = autoFill({ region: '경기남부', reason: 'all' }, {});
    for (const key of ['G1', 'G2']) {
      expect(CHOICES[key]).toContain(afterAuto[key]);
    }
  });

  it('앞 탭에서 몰린 소속은 뒤 탭에서 덜 받는다', () => {
    // 서울 2건을 모두 경기에 몰아준 뒤 경기남부를 자동으로 채운다
    const afterAuto = autoFill({ region: '경기남부', reason: 'all' }, { S1: '경기', S2: '경기' });

    // 경기는 이미 2건이라, 경기남부 2건이 또 경기로 가면 안 된다
    const toGyeonggi = ['G1', 'G2'].filter((k) => afterAuto[k] === '경기');
    expect(toGyeonggi.length).toBeLessThan(2);
  });

  it('전체 탭 자동선택은 예전처럼 전부 채운다', () => {
    const afterAuto = autoFill(ALL_SCOPE, {});
    expect(Object.keys(afterAuto).sort()).toEqual(['G1', 'G2', 'S1', 'S2']);
  });
});

/**
 * 왜 직접 골라야 하는지 묶어서 설명하기.
 *
 * 표만 보면 "여러 소속이 겹쳐서 못 정한 것"과 "아무도 안 맡아서 남은 것"이
 * 똑같아 보인다. 사람이 할 판단이 다른데 화면이 구분해 주지 않으면
 * 아무거나 골라 넣게 된다.
 */
describe('직접분류 사유 요약 (summarizePendingReasons)', () => {
  /** 서울: 겹침 2건 + 무주인 1건, 충북: 무주인 1건 */
  const FILE: SummarizableFile = {
    // 실제 분류 응답은 키·사유·후보를 같은 순서로 함께 보낸다
    pendingKeysByRegion: {
      서울: ['S1', 'S2', 'S3'],
      충북: ['C1'],
    },
    pendingReasonsByRegion: {
      서울: ['multiple', 'multiple', 'unmatched'],
      충북: ['unmatched'],
    },
    pendingChoicesByRegion: {
      서울: [['경기', '한울부원'], ['경기', '한울부원'], ['경기', '한울부원', '굿모닝제너럴', '파라인슈']],
      충북: [['경기', '한울부원', '굿모닝제너럴', '파라인슈']],
    },
  };

  it('같은 지역·이유·후보끼리 묶어 센다', () => {
    const groups = summarizePendingReasons(FILE, { region: '서울', reason: 'all' });

    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({
      region: '서울',
      reason: 'multiple',
      choices: ['경기', '한울부원'],
      count: 2,
    });
    expect(groups[1].reason).toBe('unmatched');
    expect(groups[1].count).toBe(1);
  });

  it('건수가 많은 덩어리가 먼저 온다', () => {
    const groups = summarizePendingReasons(FILE, ALL_SCOPE);
    expect(groups[0].count).toBe(2);
    expect(groups.every((g, i) => i === 0 || g.count <= groups[i - 1].count)).toBe(true);
  });

  /*
   * 전체 탭에서 지역을 합치면 "어느 지역 이야기인지" 알 수가 없다.
   * 사정이 같아 보여도 손볼 곳은 지역마다 다르므로 따로 센다.
   */
  it('전체 탭에서도 지역이 섞이지 않는다', () => {
    const groups = summarizePendingReasons(FILE, ALL_SCOPE);
    const unmatched = groups.filter((g) => g.reason === 'unmatched');

    // 서울 1건과 충북 1건이 한 덩어리로 합쳐지면 안 된다
    expect(unmatched).toHaveLength(2);
    expect(unmatched.map((g) => g.region).sort()).toEqual(['서울', '충북']);
    expect(unmatched.every((g) => g.count === 1)).toBe(true);
  });

  it('지역 탭은 그 지역만 센다', () => {
    const groups = summarizePendingReasons(FILE, { region: '충북', reason: 'all' });
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
  });

  /*
   * 같은 지역이라도 나이 구간이 다르면 사정이 다르다.
   * 후보가 다르면 다른 덩어리로 갈라야 "누구와 누가 겹쳤는지"를 제대로 말해 준다.
   */
  it('후보가 다르면 같은 이유라도 갈라 센다', () => {
    const mixed: SummarizableFile = {
      pendingKeysByRegion: { 서울: ['M1', 'M2'] },
      pendingReasonsByRegion: { 서울: ['multiple', 'multiple'] },
      pendingChoicesByRegion: { 서울: [['경기', '한울부원'], ['경기', '굿모닝제너럴']] },
    };

    expect(summarizePendingReasons(mixed, { region: '서울', reason: 'all' })).toHaveLength(2);
  });

  it('고를 게 없으면 빈 배열이다', () => {
    expect(summarizePendingReasons(null, ALL_SCOPE)).toEqual([]);
    expect(summarizePendingReasons({}, ALL_SCOPE)).toEqual([]);
  });
});

/**
 * 사유로 걸러 한꺼번에 배정하기.
 *
 * 지사가 겹친 건과 담당 지사가 없는 건은 손이 다르다 — 겹친 건은 나눠 담고,
 * 없는 건은 한 곳으로 몰아주는 일이 많다. 섞여 있으면 한 건씩 눌러 골라내야 한다.
 */
describe('사유 필터와 일괄배정', () => {
  /** 서울: 겹침 2건 + 무주인 1건 */
  const FILE: SummarizableFile = {
    pendingKeysByRegion: { 서울: ['S1', 'S2', 'S3'], 충북: ['C1'] },
    pendingReasonsByRegion: { 서울: ['multiple', 'multiple', 'unmatched'], 충북: ['unmatched'] },
    pendingChoicesByRegion: {
      서울: [['경기', '한울부원'], ['경기', '한울부원'], ['경기', '한울부원', '파라인슈']],
      충북: [['경기', '한울부원', '파라인슈']],
    },
  };

  it('사유로 거르면 그 사유의 건만 남는다', () => {
    expect([...keysInScope(FILE, { region: '서울', reason: 'multiple' })]).toEqual(['S1', 'S2']);
    expect([...keysInScope(FILE, { region: '서울', reason: 'unmatched' })]).toEqual(['S3']);
  });

  it('사유 전체면 그 지역 건이 모두 든다', () => {
    expect(keysInScope(FILE, { region: '서울', reason: 'all' }).size).toBe(3);
  });

  it('지역과 사유가 함께 걸린다', () => {
    // 충북에는 겹침 건이 없다
    expect(keysInScope(FILE, { region: '충북', reason: 'multiple' }).size).toBe(0);
    expect(keysInScope(FILE, { region: 'all', reason: 'unmatched' }).size).toBe(2);
  });

  it('보이는 건들을 한 소속으로 몰아준다', () => {
    const picks = pickAllInScope(FILE, { region: '서울', reason: 'multiple' }, '한울부원');
    expect(picks).toEqual({ S1: '한울부원', S2: '한울부원' });
  });

  /*
   * 배포는 소속명으로 파일을 만든다. 못 가는 곳에 넣으면 그 건은
   * 아무 파일에도 안 담기고 조용히 사라진다.
   */
  it('그 소속으로 갈 수 없는 건은 건드리지 않는다', () => {
    // 파라인슈는 S3만 갈 수 있다
    const picks = pickAllInScope(FILE, { region: '서울', reason: 'all' }, '파라인슈');
    expect(picks).toEqual({ S3: '파라인슈' });
  });

  it('일괄배정 목록에는 전부가 갈 수 있는 소속만 오른다', () => {
    // 서울 3건 중 파라인슈는 S3만 가능 → 공통은 경기·한울부원뿐
    expect(commonChoicesInScope(FILE, { region: '서울', reason: 'all' })).toEqual(['경기', '한울부원']);
    // 무주인 건만 보면 파라인슈도 공통이 된다
    expect(commonChoicesInScope(FILE, { region: '서울', reason: 'unmatched' })).toEqual([
      '경기', '한울부원', '파라인슈',
    ]);
  });

  it('고를 건이 없으면 일괄배정 목록도 비어 있다', () => {
    expect(commonChoicesInScope(FILE, { region: '충북', reason: 'multiple' })).toEqual([]);
    expect(commonChoicesInScope(null, ALL_SCOPE)).toEqual([]);
  });

  it('범위 키는 지역·사유를 함께 반영한다', () => {
    expect(scopeKey({ region: '서울', reason: 'multiple' })).toBe('서울|multiple');
    expect(scopeKey(ALL_SCOPE)).toBe('all|all');
  });
});

/**
 * 규칙이 이미 정한 건도 같은 표에서 다룬다.
 *
 * 자동분류된 건이 표에 안 보이면, 규칙과 다르게 보내야 할 때 배포 후에
 * 파일을 다시 만들어야 한다. 표에 함께 띄우고 그 자리에서 바꾸게 한다.
 */
describe('자동분류된 건 다루기', () => {
  const FILE: SummarizableFile & PickableFile = {
    fileName: '섞인파일.xlsx',
    pendingKeysByRegion: { 서울: ['P1'] },
    pendingRowsByRegion: { 서울: [['대기자']] },
    pendingReasonsByRegion: { 서울: ['unmatched'] },
    pendingChoicesByRegion: { 서울: [['경기', '한울부원']] },
    assignedRows: [
      { key: 'A1', region: '서울', dept: '경기', row: ['서울자동'] },
      { key: 'A2', region: '부산', dept: '한울부원', row: ['부산자동'] },
      // 주소를 못 읽어 지역이 없는 건
      { key: 'A3', region: null, dept: '파라인슈', row: ['주소불가'] },
    ],
    assignableDepts: ['경기', '한울부원', '파라인슈', '굿모닝제너럴'],
  };

  it('전체 범위에는 자동분류 건도 함께 든다', () => {
    const rows = rowsInScope(FILE, ALL_SCOPE);
    expect(rows.map((r) => r.key).sort()).toEqual(['A1', 'A2', 'A3', 'P1']);
  });

  it('자동분류만 걸러 볼 수 있다', () => {
    const rows = rowsInScope(FILE, { region: 'all', reason: 'assigned' });
    expect(rows.map((r) => r.key)).toEqual(['A1', 'A2', 'A3']);
    expect(rows.every((r) => r.reason === 'assigned')).toBe(true);
  });

  it('자동분류 건에는 규칙이 정한 소속이 붙어 온다', () => {
    const [first] = rowsInScope(FILE, { region: '서울', reason: 'assigned' });
    expect(first.assignedDept).toBe('경기');
  });

  /* 규칙 밖으로 옮기는 일이라 그 행의 후보가 아니라 배정 가능한 소속 전부를 준다. */
  it('자동분류 건은 어느 소속으로든 옮길 수 있다', () => {
    const [first] = rowsInScope(FILE, { region: '서울', reason: 'assigned' });
    expect(first.choices).toEqual(['경기', '한울부원', '파라인슈', '굿모닝제너럴']);
  });

  it('지역 탭으로도 걸러진다', () => {
    expect(rowsInScope(FILE, { region: '부산', reason: 'all' }).map((r) => r.key)).toEqual(['A2']);
  });

  it('지역을 못 읽은 건은 지역 탭에 안 걸린다', () => {
    const all = rowsInScope(FILE, ALL_SCOPE);
    expect(all.find((r) => r.key === 'A3')?.region).toBeNull();
    expect(rowsInScope(FILE, { region: '서울', reason: 'all' }).map((r) => r.key)).toEqual(['A1', 'P1']);
  });

  /*
   * 옮긴 건이 '선택 반영'에 안 잡히면, 배포 전에는 몇 건이 어디로 가는지
   * 알 수가 없다.
   */
  it('자동분류 건을 옮기면 선택 반영에 잡힌다', () => {
    const added = collectAddedRows(FILE, { A1: '파라인슈' });
    expect(added!['파라인슈']).toEqual([['서울자동']]);
  });

  it('규칙과 같은 소속을 고른 것은 옮긴 것이 아니다', () => {
    const added = collectAddedRows(FILE, { A1: '경기' });
    expect(added!['경기']).toBeUndefined();
  });

  /* 배포 게이트는 '아직 안 고른 건'만 본다. 자동분류 건은 이미 정해져 있다. */
  it('자동분류 건은 배포를 막지 않는다', () => {
    expect(findUnpicked([FILE], {})).toHaveLength(1);
    expect(findUnpicked([FILE], { 0: { P1: '경기' } })).toEqual([]);
  });
});
