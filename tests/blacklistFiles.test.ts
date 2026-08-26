import { describe, it, expect } from 'vitest';
import { attachSourceFiles, findSourceFiles, type SourceFile } from '@/lib/blacklistFiles';
import type { BlacklistKey } from '@/lib/blacklist';

/**
 * 출처 파일 목록.
 *
 * 신청 한 건이 한 줄이다 — '3회'라고 적힌 옆에는 세 줄이 떠야 관리자가
 * 숫자와 목록을 대조할 수 있다.
 *
 * 이 기능은 열 이름을 틀린 채(files.file_name) 조용히 죽어 있었다. 쿼리가
 * 실패해도 error를 안 봐서 아무도 몰랐고, 등록 당시 파일 하나만 계속 보였다.
 */

const 상품 = '동양생명(치매간병보험)_상담예약(보관에어프라이어)';

const 사람: BlacklistKey = {
  product: 상품,
  birth: '7301192',
  tel1: '01059380726',
  tel2: '01059380726',
};

/** 파일 한 행 */
const row = (orderNo: string, o: Partial<BlacklistKey> = {}, customerName = '여울찬') => ({
  orderNo,
  customerName,
  product: 상품,
  key: { ...사람, ...o },
});

const file = (id: string, name: string, rows: ReturnType<typeof row>[]): SourceFile => ({
  id,
  name,
  rows,
});

describe('신청 건별 출처 찾기', () => {
  it('한 파일에 세 건이면 세 줄이다 — 신청횟수와 맞아야 한다', () => {
    const files = [file('f1', 'A.xlsx', [row('20796867'), row('20796767'), row('20796710')])];

    expect(findSourceFiles(사람, files).map((h) => [h.id, h.name, h.orderNo])).toEqual([
      ['f1', 'A.xlsx', '20796867'],
      ['f1', 'A.xlsx', '20796767'],
      ['f1', 'A.xlsx', '20796710'],
    ]);
  });

  /**
   * 실제로 같은 파일이 두 번 올라가 있다. 주문번호로 안 묶으면 '3회' 옆에
   * 여섯 줄이 떠서 숫자와 목록이 어긋난다.
   */
  it('같은 파일을 두 번 올려도 주문번호가 같으면 한 건이다', () => {
    const 세건 = [row('20796867'), row('20796767'), row('20796710')];
    const files = [file('f1', 'A.xlsx', 세건), file('f2', 'A.xlsx', 세건)];

    expect(findSourceFiles(사람, files)).toHaveLength(3);
  });

  it('서로 다른 파일의 다른 신청은 각각 센다', () => {
    const files = [
      file('f1', 'A.xlsx', [row('1001'), row('1002')]),
      file('f2', 'B.xlsx', [row('2001')]),
    ];

    expect(findSourceFiles(사람, files).map((h) => h.name)).toEqual([
      'A.xlsx',
      'A.xlsx',
      'B.xlsx',
    ]);
  });

  it('주문번호가 없는 행은 묶지 않고 각각 한 건으로 둔다', () => {
    const files = [file('f1', 'A.xlsx', [row(''), row('')])];

    expect(findSourceFiles(사람, files)).toHaveLength(2);
  });

  it('다른 사람의 행은 세지 않는다', () => {
    const files = [
      file('f1', 'A.xlsx', [
        row('1001'),
        row('1002', { tel1: '01088888888', tel2: '01088888888' }),
      ]),
    ];

    expect(findSourceFiles(사람, files)).toHaveLength(1);
  });

  it('줄마다 그 파일의 id를 들고 간다 — 눌렀을 때 맞는 파일이 열려야 한다', () => {
    const files = [file('f1', 'A.xlsx', [row('1001')]), file('f2', 'B.xlsx', [row('2001')])];

    expect(findSourceFiles(사람, files).map((h) => h.id)).toEqual(['f1', 'f2']);
  });
});

const record = (o: Record<string, any> = {}) => ({
  id: 20,
  product_name: 상품,
  birth: '7301192',
  tel1: '01059380726',
  tel2: '01059380726',
  source_file_id: 'orig-file',
  source_file_name: '등록당시.xlsx',
  ...o,
});

const toKey = (r: any): BlacklistKey => ({
  product: r.product_name || '',
  birth: r.birth || '',
  tel1: r.tel1 || '',
  tel2: r.tel2 || '',
});

describe('명단에 출처 붙이기', () => {
  it('행을 쪼개지 않는다 — 사람 한 명이 표에서 한 줄이다', () => {
    const files = [file('f1', 'A.xlsx', [row('1001'), row('1002'), row('1003')])];

    const got = attachSourceFiles([record()], toKey, files);

    expect(got).toHaveLength(1);
    expect(got[0].source_files).toHaveLength(3);
  });

  it('파일에서 못 찾으면 등록 당시의 출처를 그대로 쓴다', () => {
    const got = attachSourceFiles([record()], toKey, []);

    expect(got[0].source_files).toEqual([{ id: 'orig-file', name: '등록당시.xlsx' }]);
  });

  it('수동 등록(출처 없음)은 - 한 줄로 남는다', () => {
    const 수동 = record({ source_file_id: null, source_file_name: null, product_name: '' });

    const got = attachSourceFiles([수동], toKey, [file('f1', 'A.xlsx', [row('1001')])]);

    expect(got[0].source_files).toEqual([{ id: null, name: '-' }]);
  });

  /**
   * 이름이 달라도 번호가 겹치면 한 사람으로 묶인다. 그 행에 적힌 이름을
   * 같이 보여줘야 관리자가 "왜 이 사람이 묶였나"를 되짚을 수 있다.
   */
  it('행마다 그 행에 적힌 이름을 들고 간다', () => {
    const files = [
      file('f1', 'A.xlsx', [row('1001', {}, '여울찬'), row('1002', {}, '테스트')]),
    ];

    const got = attachSourceFiles([record()], toKey, files);

    expect(got[0].source_files.map((f) => f.customerName)).toEqual(['여울찬', '테스트']);
  });

  it('여러 사람을 한 번에 처리한다', () => {
    const 갑 = record({ id: 20 });
    const 을 = record({ id: 21, tel1: '01012341234', tel2: '01012341234' });
    const files = [
      file('f1', 'A.xlsx', [
        row('1001'),
        row('1002'),
        row('2001', { tel1: '01012341234', tel2: '01012341234' }),
      ]),
    ];

    const got = attachSourceFiles([갑, 을], toKey, files);

    expect(got[0].source_files).toHaveLength(2);
    expect(got[1].source_files).toHaveLength(1);
  });
});
