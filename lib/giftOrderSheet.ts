import ExcelJS from 'exceljs';
import { koreanDay } from '@/lib/rangeRows';
import type { GiftRequestRow } from '@/lib/gifts';

/**
 * 발주리스트 엑셀.
 *
 * 거래처(GA코리아)가 받는 양식 그대로 만든다 — 열 순서, 1행의 '*필수' 표시,
 * 2행의 열 이름, 그리고 **서식까지**. 실제 파일(2026-09-02, 14건)을 열어 열 너비·
 * 채움·테두리·글꼴·정렬을 그대로 옮겼다. 사은품담당자가 화면을 보고 옮겨 적던
 * 것을 이 파일로 대신하므로, 받는 쪽이 "늘 오던 그 파일"로 읽어야 한다.
 *
 * 발주일·택배사·운송장번호는 **비워서 낸다.** 우리가 채워 보내는 값이 아니라
 * 발주 뒤 송장이 나오면 담당자가 채우는 값이다(실제 파일 14건 전부 빈칸).
 * 다만 이미 채워진 건(shipped)을 다시 내려받을 때는 그 값을 그대로 낸다.
 *
 * 값을 만드는 함수(orderSheetRow·orderSheetRows)는 순수하다 — DB도 요청도
 * 모른다. 통합 문서를 만드는 쪽만 exceljs를 든다.
 */

/** 거래처 양식의 열. 순서가 곧 규격이다. */
export const ORDER_SHEET_HEADERS = [
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
] as const;

/**
 * 1행의 '*필수' 표시. 실제 파일의 자리를 그대로 옮겼다 —
 * 발주일·고객명·전화번호1·전화번호2·주소·사은품명·수량·보내시는분·보내시는분 연락처·상품명(방송사).
 */
const REQUIRED_MARK_AT = new Set([0, 3, 4, 5, 7, 9, 10, 12, 13, 14]);

/** 실제 파일의 열 너비(엑셀 단위). 주소·상품명이 넓고 수량·우편번호가 좁다. */
export const ORDER_SHEET_WIDTHS = [
  10.125, 8.875, 12.125, 6.375, 13.125, 12.625, 8, 77.625, 20, 35.125, 6.625, 26.875, 15.5,
  22.125, 25.625, 10.5, 8.875, 8.875,
] as const;

/* 실제 파일의 색. 열 이름 줄은 회색, 뒤쪽 세 칸(고객번호·상담원·정산구분)은 주황이다. */
const GRAY = 'FFD9D9D9';
const ORANGE = 'FFFFC000';
const WHITE = 'FFFFFFFF';
const KOREAN_FONT = '맑은 고딕';

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function orderSheetRow(row: GiftRequestRow): (string | number)[] {
  return [
    /*
     * 발주일은 늘 비운다. 거래처가 실제로 내보낸 날을 적는 칸이라 우리는 모른다.
     * 우리가 가진 order_date는 "발주리스트를 만든 날"이지 그 날이 아니다 —
     * 다른 뜻의 날짜를 같은 칸에 넣으면 거래처 쪽 기록이 어긋난다.
     */
    '',
    text(row.courier),
    text(row.tracking_no),
    text(row.customer_name),
    text(row.phone1),
    text(row.phone2),
    text(row.zip),
    text(row.address),
    text(row.delivery_memo),
    text(row.gift_name),
    row.quantity ?? 1,
    text(row.note),
    text(row.sender_name),
    text(row.sender_phone),
    text(row.product),
    text(row.customer_no),
    text(row.counselor),
    text(row.settlement),
  ];
}

/** 시트에 들어갈 2차원 배열. 1행 표시, 2행 열 이름, 3행부터 데이터. */
export function orderSheetRows(rows: GiftRequestRow[]): (string | number)[][] {
  const marks = ORDER_SHEET_HEADERS.map((_, at) => (REQUIRED_MARK_AT.has(at) ? '*필수' : ''));
  return [marks, [...ORDER_SHEET_HEADERS], ...rows.map(orderSheetRow)];
}

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
const ALL_BORDERS: Partial<ExcelJS.Borders> = { top: thin, left: thin, right: thin, bottom: thin };
/* 1행은 아래 테두리가 없다 — 열 이름 줄과 붙어 한 덩어리로 보이게 한 것이다. */
const TOP_BORDERS: Partial<ExcelJS.Borders> = { top: thin, left: thin, right: thin };

const solid = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

/**
 * 거래처 양식대로 꾸민 통합 문서.
 *
 *   1행  '*필수' 표시. 10pt, 흰 채움, 위·좌·우 테두리
 *   2행  열 이름. Arial 굵게 10pt, 가운데 정렬, 회색 채움(뒤 세 칸은 주황), 사방 테두리
 *   3행~ 데이터. 9pt, 왼쪽 정렬, 사방 테두리. 발주일 칸은 날짜 서식(m/d/yy)
 * 열 너비·기본 행 높이·확대 비율·자동 필터도 실제 파일과 같다.
 */
export function buildOrderWorkbook(rows: GiftRequestRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('발주리스트', {
    properties: { defaultRowHeight: 16.5 },
    views: [{ zoomScale: 85 }],
  });

  sheet.columns = ORDER_SHEET_WIDTHS.map((width) => ({ width }));

  const [marks, headers, ...data] = orderSheetRows(rows);
  const columnCount = ORDER_SHEET_HEADERS.length;

  const markRow = sheet.addRow(marks);
  markRow.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.font = { name: KOREAN_FONT, size: 10 };
    cell.fill = solid(WHITE);
    // 뒤 세 칸은 실제 파일에서 아래 테두리까지 있다 — 열 이름 줄의 주황 칸과 짝이 맞는다.
    cell.border = col >= 16 ? ALL_BORDERS : TOP_BORDERS;
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });

  const headerRow = sheet.addRow(headers);
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    const last = col === columnCount;
    cell.font = last
      ? { name: KOREAN_FONT, size: 10, bold: true }
      : { name: 'Arial', size: 10, bold: true };
    cell.fill = solid(col >= 16 ? ORANGE : GRAY);
    cell.border = ALL_BORDERS;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: last };
  });

  for (const values of data) {
    const row = sheet.addRow(
      values.map((v, at) =>
        // 고객번호가 숫자로만 되어 있으면 숫자로 낸다. 실제 파일이 그렇다(20647967).
        at === 15 && /^\d+$/.test(String(v)) && String(v).length < 16 ? Number(v) : v
      )
    );
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.font = { name: KOREAN_FONT, size: 9 };
      cell.border = ALL_BORDERS;
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      if (col === 1) {
        cell.numFmt = 'm/d/yy';
        cell.fill = solid(WHITE);
      }
    });
  }

  // 실제 파일은 열 이름 줄부터 상담원 열까지 자동 필터가 걸려 있다.
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2 + data.length, column: 17 } };

  return workbook;
}

/** 내려받기용 바이트. 라우트가 그대로 응답에 싣는다. */
export async function orderWorkbookBuffer(rows: GiftRequestRow[]): Promise<Buffer> {
  const out = await buildOrderWorkbook(rows).xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

/**
 * 파일 이름. 실제 파일의 꼴을 따른다: `260902_파라미타_GA코리아_사은품 발주리스트(추가14건).xlsx`
 * '추가'는 거래처 쪽 표기라 빼고 건수만 적는다.
 */
export function orderSheetFileName(count: number, at: Date = new Date()): string {
  // 한국 날짜. 서버 시계(UTC)로 재면 아침 아홉 시 전에 만든 파일이 전날 이름으로 나간다.
  const day = koreanDay(at.toISOString()).replace(/-/g, '').slice(2);
  return `${day}_파라미타_GA코리아_사은품 발주리스트(${count}건).xlsx`;
}
