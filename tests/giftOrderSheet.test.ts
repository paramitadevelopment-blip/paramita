import { describe, it, expect } from 'vitest';
import {
  ORDER_SHEET_HEADERS,
  orderSheetRows,
  orderSheetRow,
  buildOrderWorkbook,
  orderSheetFileName,
} from '@/lib/giftOrderSheet';
import type { GiftRequestRow } from '@/lib/gifts';

/**
 * 발주리스트 엑셀은 거래처 양식이다. 열 하나가 어긋나면 거래처 쪽에서 튕긴다.
 * 실제 파일(2026-09-02, 14건)에서 확인한 모양을 그대로 못 박는다.
 */
function row(over: Partial<GiftRequestRow> = {}): GiftRequestRow {
  return {
    id: 1,
    order_no: 'ORD-1',
    source_file_id: null,
    source_file_name: null,
    order_date: null,
    courier: null,
    tracking_no: null,
    customer_name: '이경덕',
    phone1: '010-4188-3979',
    phone2: null,
    zip: null,
    address: '부산광역시 사하구 승학로 221',
    delivery_memo: null,
    gift_name: '보관에어프라이어',
    quantity: 1,
    note: null,
    sender_name: '한울부원지사',
    sender_phone: '010-3408-5120',
    product: '흥국화재(든든한3N5)_상담예약(보관에어프라이어)',
    customer_no: '20647967',
    counselor: '이승희',
    settlement: '정산해당',
    requester_id: 1,
    requester_name: '지사',
    group_name: '한울부원',
    status: 'ordered',
    forwarded_by: null,
    forwarded_at: null,
    shipped_by: null,
    shipped_at: null,
    supplement_reason: null,
    supplement_by: null,
    supplement_at: null,
    withdrawn_by: null,
    withdrawn_at: null,
    withdraw_reason: null,
    order_id: 1,
    read_at: null,
    read_by: null,
    checked_by: null,
    checked_at: null,
    check_reason: null,
    ship_read_at: null,
    ship_read_by: null,
    created_at: '2026-09-07T00:00:00Z',
    updated_at: '2026-09-07T00:00:00Z',
    ...over,
  };
}

describe('발주리스트 열', () => {
  it('열 18개가 거래처 양식 순서 그대로다', () => {
    expect([...ORDER_SHEET_HEADERS]).toEqual([
      '발주일',
      '택배사',
      '운송장번호',
      '고객명',
      '전화번호1',
      '전화번호2',
      '우편번호',
      '주소',
      '배송메세지',
      '사은품명',
      '수량',
      '비고',
      '보내시는분',
      '보내시는분 연락처',
      '상품명(방송사)',
      '고객번호',
      '상담원',
      '정산구분',
    ]);
  });

  it("1행은 '*필수' 표시행, 2행이 열 이름이다 — 실제 파일과 같은 자리", () => {
    const rows = orderSheetRows([]);
    expect(rows).toHaveLength(2);
    const marks = rows[0].map((v, at) => (v === '*필수' ? at : -1)).filter((at) => at >= 0);
    // 발주일·고객명·전화번호1·전화번호2·주소·사은품명·수량·보내시는분·연락처·상품명
    expect(marks).toEqual([0, 3, 4, 5, 7, 9, 10, 12, 13, 14]);
    expect(rows[1]).toEqual([...ORDER_SHEET_HEADERS]);
  });
});

describe('발주리스트 행', () => {
  it('발주일·택배사·운송장번호는 비워서 낸다 — 거래처가 채우는 값이다', () => {
    const out = orderSheetRow(row({ order_date: null, courier: null, tracking_no: null }));
    expect(out.slice(0, 3)).toEqual(['', '', '']);
  });

  it('송장이 채워진 건(shipped)은 택배사·운송장을 그대로 낸다 — 발주일은 여전히 비운다', () => {
    const out = orderSheetRow(
      row({ status: 'shipped', order_date: '2026-09-07', courier: 'CJ대한통운', tracking_no: '1234-5678' })
    );
    // 발주일은 거래처가 실제로 내보낸 날이라 우리는 모른다. order_date(묶은 날)와 뜻이 다르다.
    expect(out.slice(0, 3)).toEqual(['', 'CJ대한통운', '1234-5678']);
  });

  it('값이 열 이름과 같은 자리에 선다', () => {
    const out = orderSheetRow(row());
    const at = (name: string) => out[ORDER_SHEET_HEADERS.indexOf(name as any)];
    expect(at('고객명')).toBe('이경덕');
    expect(at('전화번호1')).toBe('010-4188-3979');
    expect(at('주소')).toBe('부산광역시 사하구 승학로 221');
    expect(at('사은품명')).toBe('보관에어프라이어');
    expect(at('수량')).toBe(1);
    expect(at('보내시는분')).toBe('한울부원지사');
    expect(at('상품명(방송사)')).toBe('흥국화재(든든한3N5)_상담예약(보관에어프라이어)');
    expect(at('고객번호')).toBe('20647967');
    expect(at('상담원')).toBe('이승희');
    expect(at('정산구분')).toBe('정산해당');
  });

  it('빈 값은 빈 문자열이다 — null이 셀에 찍히면 안 된다', () => {
    const out = orderSheetRow(row({ phone2: null, zip: null, note: null }));
    expect(out).not.toContain(null);
    expect(out).not.toContain('null');
  });

  it('행마다 열 수가 정확히 18이다', () => {
    expect(orderSheetRow(row())).toHaveLength(18);
    expect(orderSheetRows([row(), row({ id: 2 })])[3]).toHaveLength(18);
  });
});

describe('통합 문서', () => {
  it("시트 이름은 '발주리스트'이고 건수만큼 행이 있다", () => {
    const wb = buildOrderWorkbook([row(), row({ id: 2 }), row({ id: 3 })]);
    expect(wb.worksheets.map((s) => s.name)).toEqual(['발주리스트']);
    const sheet = wb.getWorksheet('발주리스트')!;
    // 표시행·열이름·데이터 3행, 열 18개
    expect(sheet.rowCount).toBe(5);
    expect(sheet.columnCount).toBe(18);
  });

  /*
   * 서식. 거래처가 "늘 오던 그 파일"로 읽어야 하므로 실제 파일(2026-09-02)에서
   * 읽어 낸 값을 그대로 못 박는다. 값이 아니라 꾸밈이 어긋나도 받는 쪽은 낯설다.
   */
  it('열 너비가 실제 파일과 같다 — 주소가 가장 넓고 수량이 가장 좁다', () => {
    const sheet = buildOrderWorkbook([row()]).getWorksheet('발주리스트')!;
    expect(sheet.getColumn(8).width).toBeCloseTo(77.625); // 주소
    expect(sheet.getColumn(11).width).toBeCloseTo(6.625); // 수량
    expect(sheet.getColumn(15).width).toBeCloseTo(25.625); // 상품명(방송사)
  });

  it('열 이름 줄은 굵게·가운데·회색이고, 뒤 세 칸(고객번호·상담원·정산구분)은 주황이다', () => {
    const sheet = buildOrderWorkbook([row()]).getWorksheet('발주리스트')!;
    const name = sheet.getCell('D2');
    expect(name.value).toBe('고객명');
    expect(name.font?.bold).toBe(true);
    expect(name.alignment?.horizontal).toBe('center');
    expect((name.fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFD9D9D9');
    expect(name.border?.top?.style).toBe('thin');
    expect(name.border?.bottom?.style).toBe('thin');
    for (const addr of ['P2', 'Q2', 'R2']) {
      expect((sheet.getCell(addr).fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFFFC000');
    }
  });

  it("1행 '*필수'는 흰 바탕에 위·좌·우 테두리만 — 열 이름 줄과 붙어 보이게", () => {
    const sheet = buildOrderWorkbook([row()]).getWorksheet('발주리스트')!;
    const mark = sheet.getCell('A1');
    expect(mark.value).toBe('*필수');
    expect((mark.fill as { fgColor?: { argb?: string } }).fgColor?.argb).toBe('FFFFFFFF');
    expect(mark.border?.top?.style).toBe('thin');
    expect(mark.border?.bottom).toBeUndefined();
    // 표시가 없는 칸도 같은 서식이다. 빈칸이라고 테두리가 끊기면 줄이 벌어져 보인다.
    expect(sheet.getCell('B1').border?.top?.style).toBe('thin');
  });

  it('데이터 줄은 9pt·왼쪽 정렬·사방 테두리, 발주일 칸은 날짜 서식', () => {
    const sheet = buildOrderWorkbook([row()]).getWorksheet('발주리스트')!;
    const addr = sheet.getCell('H3');
    expect(addr.value).toBe('부산광역시 사하구 승학로 221');
    expect(addr.font?.size).toBe(9);
    expect(addr.alignment?.horizontal).toBe('left');
    expect(addr.border?.left?.style).toBe('thin');
    expect(sheet.getCell('A3').numFmt).toBe('m/d/yy');
  });

  it('숫자로만 된 고객번호는 숫자 셀로 낸다 — 실제 파일이 그렇다', () => {
    const sheet = buildOrderWorkbook([row({ customer_no: '20647967' })]).getWorksheet('발주리스트')!;
    expect(sheet.getCell('P3').value).toBe(20647967);
    const mixed = buildOrderWorkbook([row({ customer_no: 'ORD-1' })]).getWorksheet('발주리스트')!;
    expect(mixed.getCell('P3').value).toBe('ORD-1');
  });

  it('자동 필터가 열 이름 줄부터 상담원 열까지 걸린다', () => {
    const sheet = buildOrderWorkbook([row(), row({ id: 2 })]).getWorksheet('발주리스트')!;
    expect(sheet.autoFilter).toEqual({ from: { row: 2, column: 1 }, to: { row: 4, column: 17 } });
  });

  it('파일 이름은 실제 파일의 꼴을 따른다', () => {
    expect(orderSheetFileName(14, new Date(2026, 8, 2))).toBe(
      '260902_파라미타_GA코리아_사은품 발주리스트(14건).xlsx'
    );
  });
});
