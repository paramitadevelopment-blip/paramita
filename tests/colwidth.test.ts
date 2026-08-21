import { describe, it, expect } from 'vitest';
import { fitColumnWidths } from '@/lib/excelCell';

describe('엑셀 열 너비', () => {
  it('날짜 칸은 yyyy-mm-dd가 들어갈 만큼 잡는다', () => {
    // 이걸 안 주면 엑셀이 값 대신 ########을 보여준다.
    const cols = fitColumnWidths([['접수일자'], [new Date(2026, 7, 16)]]);
    expect(cols[0].wch).toBeGreaterThanOrEqual(10);
  });

  it('한글은 두 자리로 세어 잘리지 않게 한다', () => {
    const cols = fitColumnWidths([['고객명'], ['홍길동']]);
    expect(cols[0].wch).toBeGreaterThanOrEqual(8);
  });

  it('긴 주소도 상한을 넘지 않는다', () => {
    const cols = fitColumnWidths([['주소'], ['부산광역시 해운대구 우동 1234-56 아파트 101동 1001호']]);
    expect(cols[0].wch).toBeLessThanOrEqual(80);
  });

  it('빈 열도 최소 너비를 갖는다', () => {
    const cols = fitColumnWidths([[''], [null]]);
    expect(cols[0].wch).toBeGreaterThanOrEqual(8);
  });

  it('헤더가 데이터보다 길면 헤더에 맞춘다', () => {
    const cols = fitColumnWidths([['아주아주긴헤더이름입니다'], ['A']]);
    expect(cols[0].wch).toBeGreaterThan(10);
  });
});

describe('열 개수가 행마다 다를 때', () => {
  it('전부 빈 열이 있어도 구멍이 생기지 않는다', () => {
    // 구멍이 생기면 그 뒤 열의 너비가 한 칸씩 밀린다.
    const cols = fitColumnWidths([['', '접수일자'], [null, new Date(2026, 7, 16)]]);
    expect(cols).toHaveLength(2);
    expect(cols.every((c) => typeof c?.wch === 'number')).toBe(true);
  });

  it('가장 긴 행의 열 개수에 맞춘다', () => {
    const cols = fitColumnWidths([['A'], ['A', 'B', 'C']]);
    expect(cols).toHaveLength(3);
  });
});

describe('열별 최소 너비', () => {
  it('기본은 내용에 맞춘다 — 넓게 잡으면 뒤 열이 화면 밖으로 밀린다', () => {
    // 업체명은 값이 12자 남짓인데 45칸을 주면 그 뒤 '비고'가 안 보였다.
    const cols = fitColumnWidths([['업체명'], ['동양생명(PM)_1통합']]);
    expect(cols[0].wch).toBeLessThan(30);
  });
});
