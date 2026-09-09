import { describe, it, expect } from 'vitest';
import {
  parseGiftPaste,
  parseShipPaste,
  normalizeShipDate,
  GIFT_PASTE_HEADERS,
} from '@/lib/giftPaste';

/**
 * 발주리스트 양식(열 18개)을 붙여넣어 읽는다.
 *
 * 두 모양이 온다: 엑셀에서 복사한 탭 구분 줄, 웹 표에서 복사한 한 칸씩 줄바꿈.
 * 두 번째는 빈 칸이 전각 공백(　)으로 오고 칸 사이에 빈 줄이 낀다 — 실제로
 * 지사가 붙여넣은 모양 그대로다.
 */
const HEADER_LINE = [...GIFT_PASTE_HEADERS].join('\t');

const CELLS = [
  '', '', '', // 발주일·택배사·운송장번호 — 거래처가 채운다
  '이경덕', '010-4188-3979', '',
  '', '부산광역시 사하구 승학로   221 102동408호 (괴정동, 괴정한신아파트)', '',
  '보관에어프라이어', '1', '',
  '한울부원지사', '010-3408-5120',
  '흥국화재(든든한3N5)_상담예약(보관에어프라이어)', '20647967', '이승희', '정산해당',
];

/** 웹 표를 복사한 모양: 머리글 줄 + 칸마다 줄바꿈, 칸 사이 빈 줄, 빈 칸은 전각 공백. */
const webPaste = (cells: string[]) =>
  HEADER_LINE + '\n\n' + cells.map((c) => (c === '' ? '　' : c)).join('\n\n') + '\n';

describe('한 칸씩 줄바꿈 (웹 표)', () => {
  it('빈 칸(전각 공백)을 버리지 않아 뒤 칸이 밀리지 않는다', () => {
    const { rows, problems, skipped } = parseGiftPaste(webPaste(CELLS));
    expect(skipped).toBe(0);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.pastedName).toBe('이경덕');
    expect(r.pastedPhone).toBe('010-4188-3979');
    expect(r.address).toContain('부산광역시');
    expect(r.giftName).toBe('보관에어프라이어');
    expect(r.quantity).toBe(1);
    expect(r.senderName).toBe('한울부원지사');
    expect(r.senderPhone).toBe('010-3408-5120');
    expect(r.product).toContain('흥국화재');
    expect(r.counselor).toBe('이승희');
    expect(r.settlement).toBe('정산해당');
  });

  it('고객번호가 곧 주문번호다', () => {
    const { rows } = parseGiftPaste(webPaste(CELLS));
    expect(rows[0].orderNo).toBe('20647967');
    expect(rows[0].customerNo).toBe('20647967');
  });

  it('여러 건이 이어져 있으면 열여덟 칸씩 끊는다', () => {
    const second = [...CELLS];
    second[3] = '김성희';
    second[15] = '20683170';
    const text = webPaste([...CELLS, ...second]);
    const { rows } = parseGiftPaste(text);
    expect(rows).toHaveLength(2);
    expect(rows[1].pastedName).toBe('김성희');
    expect(rows[1].orderNo).toBe('20683170');
  });

  it('머리글이 없어도 읽는다', () => {
    const text = CELLS.map((c) => (c === '' ? '　' : c)).join('\n\n');
    const { rows } = parseGiftPaste(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].pastedName).toBe('이경덕');
  });
});

describe('탭 구분 (엑셀)', () => {
  it('한 줄에 열여덟 칸, 머리글은 건너뛴다', () => {
    const text = HEADER_LINE + '\n' + CELLS.join('\t') + '\n';
    const { rows, problems } = parseGiftPaste(text);
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].pastedName).toBe('이경덕');
    expect(rows[0].orderNo).toBe('20647967');
  });

  it('빈 줄은 무시한다', () => {
    const text = CELLS.join('\t') + '\n\n\n' + CELLS.join('\t') + '\n';
    expect(parseGiftPaste(text).rows).toHaveLength(2);
  });
});

describe('검사', () => {
  it('필수 칸이 비면 문제로 표시하되 읽기는 한다', () => {
    const bad = [...CELLS];
    bad[9] = ''; // 사은품명
    const { rows, problems } = parseGiftPaste(bad.join('\t'));
    expect(rows).toHaveLength(1);
    expect(problems).toHaveLength(1);
    expect(problems[0].at).toBe(1);
    expect(problems[0].reason).toMatch(/사은품명/);
  });

  it('고객번호가 비면 문제다 — 배포 기록을 찾을 열쇠가 없다', () => {
    const noKey = [...CELLS];
    noKey[15] = '';
    const { rows, problems } = parseGiftPaste(noKey.join('\t'));
    expect(rows).toHaveLength(1);
    expect(problems[0].reason).toMatch(/주문번호/);
  });

  it('수량이 비면 1로 본다', () => {
    const c = [...CELLS];
    c[10] = '';
    expect(parseGiftPaste(c.join('\t')).rows[0].quantity).toBe(1);
  });

  it('칸이 모자란 덩어리는 버리고 센다', () => {
    const { rows, skipped } = parseGiftPaste(CELLS.slice(0, 10).join('\t'));
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });
});

/**
 * 발주처가 채워 돌려준 표.
 *
 * 보낸 발주리스트가 발주일·택배사·운송장번호가 채워져 돌아온다. 열 순서는 보낼
 * 때와 같고, 우리가 쓰는 것은 앞 세 칸·배송메세지·고객번호다.
 */
const SHIPPED = [
  '2026-09-08', 'CJ대한통운', '1234-5678-9012',
  '박헌정', '010-9700-9461', '010-9700-9461',
  '14905', '경기 시흥시 대야로 46 C동 501호', '부재 시 경비실',
  '보관에어프라이어', '1', '',
  '경기지사', '010-3408-5120',
  '동양생명(PA-01간병)보관에프', '67309060', '김설계', '정산해당',
];

describe('발주처가 채워 준 표 읽기', () => {
  it('발주일·택배사·운송장번호·배송메세지를 고객번호와 함께 읽는다', () => {
    const { rows, skipped } = parseShipPaste(SHIPPED.join('\t'));
    expect(skipped).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orderNo: '67309060',
      customerName: '박헌정',
      giftName: '보관에어프라이어',
      quantity: 1,
      orderDate: '2026-09-08',
      courier: 'CJ대한통운',
      trackingNo: '1234-5678-9012',
      deliveryMemo: '부재 시 경비실',
    });
  });

  it('여러 줄을 읽는다 — 머리글은 건너뛴다', () => {
    const second = [...SHIPPED];
    second[15] = '67309098';
    second[2] = '9999-0000';
    const text = HEADER_LINE + '\n' + SHIPPED.join('\t') + '\n' + second.join('\t');
    const { rows } = parseShipPaste(text);
    expect(rows.map((r) => r.orderNo)).toEqual(['67309060', '67309098']);
  });

  it('고객번호가 없으면 버린다 — 우리 신청을 찾을 열쇠가 없다', () => {
    const noKey = [...SHIPPED];
    noKey[15] = '';
    const { rows, skipped } = parseShipPaste(noKey.join('\t'));
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('택배사도 운송장도 없으면 버린다 — 아직 안 온 줄이다', () => {
    const empty = [...SHIPPED];
    empty[1] = '';
    empty[2] = '';
    const { rows, skipped } = parseShipPaste(empty.join('\t'));
    expect(rows).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('운송장만 있어도 읽는다 — 택배사를 안 적어 주는 곳이 있다', () => {
    const onlyTracking = [...SHIPPED];
    onlyTracking[1] = '';
    expect(parseShipPaste(onlyTracking.join('\t')).rows).toHaveLength(1);
  });
});

describe('붙여넣은 발주일 읽기', () => {
  it('여러 서식을 같은 날짜로 읽는다', () => {
    expect(normalizeShipDate('2026-09-08')).toBe('2026-09-08');
    expect(normalizeShipDate('2026. 9. 8')).toBe('2026-09-08');
    expect(normalizeShipDate('2026/09/08')).toBe('2026-09-08');
    // 엑셀이 미국식으로 내보내면 월/일/연으로 온다.
    expect(normalizeShipDate('9/8/2026')).toBe('2026-09-08');
  });

  it('못 읽으면 빈 값 — 오늘로 때우면 발주일이 조용히 틀린다', () => {
    expect(normalizeShipDate('')).toBe('');
    expect(normalizeShipDate('곧 발송')).toBe('');
    expect(normalizeShipDate('2026-13-01')).toBe('');
    expect(normalizeShipDate('2026-02-30')).toBe('');
  });
});

/**
 * 거래처 양식을 통째로 복사하면 머리글 위에 `*필수` 표시 줄이 같이 온다.
 * 그 줄은 값이 아니다 — 문제 줄로 잡히면 안 된다.
 */
const REQUIRED_LINE = [
  '*필수', '', '', '*필수', '*필수', '*필수', '', '*필수', '', '*필수', '*필수', '', '*필수', '*필수', '*필수', '', '', '',
].join('\t');

describe('*필수 표시 줄', () => {
  it('엑셀 복사: 필수 줄 + 머리글 + 본문 → 본문만 읽고 문제 없음', () => {
    const { rows, problems, skipped } = parseGiftPaste(
      REQUIRED_LINE + '\n' + HEADER_LINE + '\n' + CELLS.join('\t')
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].orderNo).toBe('20647967');
    expect(problems).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it('웹 표 복사: 필수 줄이 칸마다 줄바꿈으로 와도 걷어낸다', () => {
    const required = REQUIRED_LINE.split('\t');
    const text =
      HEADER_LINE + '\n\n' +
      required.map((c) => (c === '' ? '　' : c)).join('\n\n') + '\n\n' +
      CELLS.map((c) => (c === '' ? '　' : c)).join('\n\n') + '\n';
    const { rows, problems } = parseGiftPaste(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].pastedName).toBe('이경덕');
    expect(problems).toHaveLength(0);
  });

  it('발주처 표에도 같은 줄이 있다 — 버린 줄로 세지 않는다', () => {
    const { rows, skipped } = parseShipPaste(
      REQUIRED_LINE + '\n' + HEADER_LINE + '\n' + SHIPPED.join('\t')
    );
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it('필수 줄만 붙여넣으면 아무것도 없다', () => {
    const { rows, problems, skipped } = parseGiftPaste(REQUIRED_LINE + '\n' + HEADER_LINE);
    expect(rows).toHaveLength(0);
    expect(problems).toHaveLength(0);
    expect(skipped).toBe(0);
  });
});

describe('붙여넣은 고객 정보', () => {
  it('고객명·전화번호1·2를 그대로 들고 온다 — 저장도 이 값으로 한다', () => {
    const cells = [...CELLS];
    cells[4] = '01041883979';
    cells[5] = '010-1111-2222';
    const { rows } = parseGiftPaste(cells.join('	'));
    expect(rows[0].pastedName).toBe('이경덕');
    // 하이픈 없이 붙여넣어도 보기 좋은 꼴로 맞춰 둔다.
    expect(rows[0].pastedPhone).toBe('010-4188-3979');
    expect(rows[0].pastedPhone2).toBe('010-1111-2222');
  });

  it('전화번호2가 비면 빈 값 — 없는 번호를 지어내지 않는다', () => {
    const { rows } = parseGiftPaste(CELLS.join('	'));
    expect(rows[0].pastedPhone2).toBe('');
  });
});
