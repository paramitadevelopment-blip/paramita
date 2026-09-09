import { describe, it, expect } from 'vitest';
import {
  compareValues,
  dateSpanOf,
  escapeOr,
  ilikeTerms,
  numberOf,
  phoneVariants,
  rowMatches,
  statusesMatching,
} from '@/lib/listSearch';
import { COMPLAINT_STATUS_LABEL } from '@/lib/complaints';
import { GIFT_STATUS_LABEL } from '@/lib/gifts';

/**
 * 목록 검색이 사람이 치는 말을 알아듣는가.
 *
 * 여기서 가장 무서운 건 못 찾는 게 아니라 **조건이 쪼개지는 것**이다. 이름에
 * 쉼표가 들어 있으면 PostgREST의 or()가 거기서 갈라져, 엉뚱한 줄이 나오거나
 * 남의 지사 건이 딸려 나올 수 있다. 그래서 감싸는 것부터 본다.
 */
describe('escapeOr — 값 안의 글자가 조건을 쪼개지 못한다', () => {
  it('쉼표가 든 값은 통째로 하나의 값이 된다', () => {
    expect(escapeOr('홍길동,김철수')).toBe('"홍길동,김철수"');
  });

  it('괄호와 점도 값의 일부로 남는다', () => {
    expect(escapeOr('(주)파라.인슈')).toBe('"(주)파라.인슈"');
  });

  it('따옴표는 벗겨 넣는다 — 감싼 따옴표와 헷갈리지 않게', () => {
    expect(escapeOr('a"b')).toBe('"a\\"b"');
  });

  it('or() 조건으로 지으면 값이 감싸여 들어간다', () => {
    expect(ilikeTerms(['customer_name', 'phone'], '홍,길')).toEqual([
      'customer_name.ilike."%홍,길%"',
      'phone.ilike."%홍,길%"',
    ]);
  });
});

describe('statusesMatching — 상태말로 찾는다', () => {
  it('라벨 일부만 쳐도 걸린다', () => {
    expect(statusesMatching('보완', COMPLAINT_STATUS_LABEL)).toEqual(['returned']);
    expect(statusesMatching('보완', GIFT_STATUS_LABEL)).toEqual(['supplement']);
  });

  it('띄어쓰기는 무시한다', () => {
    expect(statusesMatching('담당지사없음', COMPLAINT_STATUS_LABEL)).toEqual(['unassigned']);
    expect(statusesMatching('담당 지사 없음', COMPLAINT_STATUS_LABEL)).toEqual(['unassigned']);
  });

  it('여럿에 걸리면 여럿을 낸다 — 하나만 골라 주면 나머지가 사라진다', () => {
    // '대기'는 사은품에서 관리자 확인 대기와 발주 대기 둘 다에 든다.
    expect(statusesMatching('대기', GIFT_STATUS_LABEL).sort()).toEqual(
      ['forwarded', 'pending_check'].sort()
    );
  });

  it('상태 코드를 그대로 쳐도 된다', () => {
    expect(statusesMatching('shipped', GIFT_STATUS_LABEL)).toEqual(['shipped']);
  });

  it('상태말이 아니면 빈 배열 — 이름 검색이 상태로 번지지 않는다', () => {
    expect(statusesMatching('홍길동', GIFT_STATUS_LABEL)).toEqual([]);
    expect(statusesMatching('', GIFT_STATUS_LABEL)).toEqual([]);
  });
});

describe('dateSpanOf — 날짜로 친 말', () => {
  it('하루는 그날 하루로 잘린다', () => {
    const span = dateSpanOf('2026-09-08')!;
    expect(span.fromDay).toBe('2026-09-08');
    expect(span.toDay).toBe('2026-09-08');
    expect(span.from).toBe('2026-09-08T00:00:00.000Z');
    expect(span.to).toBe('2026-09-08T23:59:59.999Z');
  });

  it('우리가 파일 이름에 쓰는 260908 도 같은 날이다', () => {
    expect(dateSpanOf('260908')).toEqual(dateSpanOf('2026-09-08'));
    expect(dateSpanOf('20260908')).toEqual(dateSpanOf('2026-09-08'));
    expect(dateSpanOf('2026.9.8')).toEqual(dateSpanOf('2026-09-08'));
    expect(dateSpanOf('2026/09/08')).toEqual(dateSpanOf('2026-09-08'));
  });

  it('달만 치면 그달 전체', () => {
    const span = dateSpanOf('2026-09')!;
    expect(span.fromDay).toBe('2026-09-01');
    expect(span.toDay).toBe('2026-09-30');
  });

  it('달마다 마지막 날이 다르다 — 2월과 윤년', () => {
    expect(dateSpanOf('2026-02')!.toDay).toBe('2026-02-28');
    expect(dateSpanOf('2024-02')!.toDay).toBe('2024-02-29');
  });

  it('날짜가 아니면 null — 주문번호가 날짜로 읽히면 안 된다', () => {
    expect(dateSpanOf('67309060')).toBeNull();
    expect(dateSpanOf('2026-13-01')).toBeNull();
    expect(dateSpanOf('2026-09-31')).toBeNull();
    expect(dateSpanOf('홍길동')).toBeNull();
    expect(dateSpanOf('')).toBeNull();
  });
});

describe('phoneVariants — 저장된 꼴이 달라도 찾는다', () => {
  it('숫자만 친 휴대전화를 하이픈 꼴로도 찾는다', () => {
    expect(phoneVariants('01012345678')).toContain('010-1234-5678');
  });

  it('서울 국번은 두 자리로 자른다', () => {
    expect(phoneVariants('0212345678')).toContain('02-1234-5678');
    expect(phoneVariants('021234567')).toContain('02-123-4567');
  });

  it('하이픈으로 친 값은 숫자만 남긴 꼴도 함께 본다', () => {
    expect(phoneVariants('010-1234-5678')).toContain('01012345678');
  });

  it('전화번호로 보기엔 짧으면 아무것도 안 만든다', () => {
    expect(phoneVariants('1234')).toEqual([]);
    expect(phoneVariants('홍길동')).toEqual([]);
  });
});

describe('rowMatches — 화면이 들고 있는 목록을 그 자리에서 거른다', () => {
  const row = {
    id: 39,
    customer_name: '김민원',
    phone1: '010-9700-9461',
    address: '경기 시흥시 대야로 46',
    gift_name: '보관에어프라이어',
    order_no: '67309060',
    tracking_no: '6012-0034-567',
    order_date: '2026-09-08',
    status: 'shipped',
    quantity: 2,
    note: null,
    // 중첩된 값은 훑지 않는다 — 화면에 그 모양 그대로 뜨지 않는다.
    nested: { secret: '안보임' },
  };

  it('아무 칸에나 걸리면 나온다', () => {
    for (const term of ['김민원', '시흥', '에어프라이어', '67309060', 'shipped']) {
      expect(rowMatches(row, term)).toBe(true);
    }
  });

  it('빈 검색어는 전부 통과 — 안 걸렀다는 뜻', () => {
    expect(rowMatches(row, '')).toBe(true);
    expect(rowMatches(row, '   ')).toBe(true);
  });

  it('없는 말이면 걸러진다', () => {
    expect(rowMatches(row, '홍길동')).toBe(false);
  });

  it('상태는 사람이 읽는 말로 찾는다', () => {
    expect(rowMatches(row, '배송', GIFT_STATUS_LABEL)).toBe(true);
    expect(rowMatches(row, '보완', GIFT_STATUS_LABEL)).toBe(false);
    // 라벨을 넘기지 않으면 상태말로는 못 찾는다 — 코드로만 걸린다.
    expect(rowMatches(row, '배송')).toBe(false);
  });

  it('하이픈이 든 값은 숫자만 남겨서도 찾는다', () => {
    expect(rowMatches(row, '01097009461')).toBe(true);
    expect(rowMatches(row, '60120034567')).toBe(true);
    expect(rowMatches(row, '20260908')).toBe(true);
  });

  it('중첩된 값은 안 본다 — 화면에 안 뜨는 것으로 찾히면 놀란다', () => {
    expect(rowMatches(row, '안보임')).toBe(false);
  });

  it('비어 있는 칸 때문에 터지지 않는다', () => {
    expect(rowMatches({ a: null, b: undefined }, '무엇')).toBe(false);
  });
});

describe('compareValues — 목록을 세운다', () => {
  const sortBy = (rows: unknown[], order: 'asc' | 'desc') =>
    [...rows].sort((a, b) => compareValues(a, b, order));

  it('숫자는 크기로, 글자는 한국어 순서로', () => {
    expect(sortBy([10, 2, 33], 'asc')).toEqual([2, 10, 33]);
    expect(sortBy([10, 2, 33], 'desc')).toEqual([33, 10, 2]);
    expect(sortBy(['다', '가', '나'], 'asc')).toEqual(['가', '나', '다']);
  });

  it('숫자를 글자로 견주지 않는다 — 그러면 10이 2보다 앞선다', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
  });

  it('빈 값은 오름차순에서도 내림차순에서도 뒤로 간다', () => {
    // 방향을 뒤집었다고 빈 줄이 목록 맨 위로 올라오면 세운 게 아니라 망가져 보인다.
    expect(sortBy(['나', null, '가'], 'asc')).toEqual(['가', '나', null]);
    expect(sortBy(['나', null, '가'], 'desc')).toEqual(['나', '가', null]);
    expect(sortBy(['나', '', undefined, '가'], 'desc').slice(0, 2)).toEqual(['나', '가']);
  });

  it('둘 다 비면 순서를 바꾸지 않는다', () => {
    expect(compareValues(null, '')).toBe(0);
    expect(compareValues(null, '', 'desc')).toBe(0);
  });

  it('방향을 밖에서 뒤집지 못하게 방향을 직접 받는다', () => {
    // -compareValues(a, b) 로 뒤집으면 빈 값이 맨 위로 올라온다.
    expect(compareValues('가', null, 'desc')).toBeLessThan(0);
    expect(compareValues(null, '가', 'desc')).toBeGreaterThan(0);
  });

  it('날짜 글자는 그대로 견주면 시간순이 된다', () => {
    expect(sortBy(['2026-09-10', '2026-09-02', '2026-08-31'], 'asc')).toEqual([
      '2026-08-31',
      '2026-09-02',
      '2026-09-10',
    ]);
  });
});

describe('numberOf — 번호로 부르는 것', () => {
  it('#39 도 39 도 같은 번호', () => {
    expect(numberOf('#39')).toBe(39);
    expect(numberOf('39')).toBe(39);
    expect(numberOf(' #7 ')).toBe(7);
  });

  it('숫자가 아니면 null', () => {
    expect(numberOf('#a')).toBeNull();
    expect(numberOf('39건')).toBeNull();
    expect(numberOf('')).toBeNull();
  });
});

/**
 * 통합검색이 훑는 칸 목록.
 *
 * 화면 표에 열이 보이는데 검색이 그 칸을 안 보면, 사람은 눈으로 훑게 된다.
 * 새 열을 표에 붙일 때 여기도 같이 늘어나야 한다.
 */
describe('통합검색이 훑는 칸', () => {
  it('블랙리스트: 사유·해제 사유까지 본다', () => {
    const columns = ['customer_name', 'product_name', 'birth', 'tel1', 'tel2', 'reason', 'release_reason', 'source_file_name', 'registered_by'];
    const terms = ilikeTerms(columns, '홍길동');
    expect(terms).toHaveLength(columns.length);
    expect(terms).toContain('reason.ilike."%홍길동%"');
    expect(terms).toContain('release_reason.ilike."%홍길동%"');
  });

  it('재신청 고객: 생년월일·결과·주문번호·배정 소속·근거 파일까지 본다', () => {
    const columns = ['customer_name', 'birth', 'tel1', 'tel2', 'product_name', 'reason', 'order_no', 'source_file_name', 'assigned_dept', 'assigned_group', 'assigned_file_name'];
    const terms = ilikeTerms(columns, '한울부원');
    expect(terms).toContain('birth.ilike."%한울부원%"');
    expect(terms).toContain('order_no.ilike."%한울부원%"');
    expect(terms).toContain('assigned_dept.ilike."%한울부원%"');
    expect(terms).toContain('assigned_file_name.ilike."%한울부원%"');
  });

  it('쉼표·괄호가 든 값도 조건이 쪼개지지 않는다', () => {
    const terms = ilikeTerms(['reason'], '중복 (이름, 전화)');
    expect(terms[0]).toBe('reason.ilike."%중복 (이름, 전화)%"');
  });
});
