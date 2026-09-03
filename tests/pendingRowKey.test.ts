import { describe, it, expect } from 'vitest';
import {
  pendingRowKey,
  dedupeByOrderNumber,
  isOrderNumberMissing,
} from '@/lib/insurance';
import { detectRegion } from '@/lib/assignmentRegions';

/**
 * 사람이 부서를 골라야 하는 행의 키 검증.
 *
 * 화면은 지역별로 묶어 보여주고 배포는 파일 행 순서로 돈다. 이 둘을 잇는 게 키다.
 * 키가 겹치면 한 사람의 선택이 다른 사람에게도 붙어, 엉뚱한 부서로 고객이 나간다.
 * 나간 뒤에는 되돌릴 수 없으므로 겹치지 않는 것이 핵심이다.
 */

describe('선택 대기 행 키', () => {
  it('주문번호가 있으면 그대로 쓴다', () => {
    expect(pendingRowKey('20796767', 0)).toBe('20796767');
    expect(pendingRowKey(20796767, 5)).toBe('20796767');
  });

  it('앞뒤 공백은 떼고 쓴다 — 분류와 배포가 같은 값을 얻어야 한다', () => {
    expect(pendingRowKey(' 20796767 ', 0)).toBe('20796767');
  });

  it('같은 주문번호는 순번이 달라도 같은 키다', () => {
    // 배포는 자기 순번으로 키를 다시 만든다. 주문번호가 있으면 순번과 무관해야
    // 화면에서 고른 값이 배포에서 그대로 찾아진다.
    expect(pendingRowKey('1001', 3)).toBe(pendingRowKey('1001', 3));
    expect(pendingRowKey('1001', 0)).toBe(pendingRowKey('1001', 99));
  });

  it('주문번호가 비면 순번으로 대신해 서로 겹치지 않는다', () => {
    // 이게 이 함수의 존재 이유다. 예전에는 둘 다 ''이 되어 키가 겹쳤다.
    const a = pendingRowKey('', 0);
    const b = pendingRowKey('', 1);
    expect(a).not.toBe(b);
    expect(a).toBe('#0');
    expect(b).toBe('#1');
  });

  it('null·undefined도 빈 값과 같이 다룬다', () => {
    expect(pendingRowKey(null, 2)).toBe('#2');
    expect(pendingRowKey(undefined, 3)).toBe('#3');
  });

  it('순번 키가 실제 주문번호와 부딪히지 않는다', () => {
    // 주문번호는 숫자·영문이라 '#'로 시작하지 않는다
    expect(pendingRowKey('', 0)).not.toBe(pendingRowKey('0', 0));
  });
});

describe('예전 방식이었다면 겪었을 상황 (회귀 방지)', () => {
  /** 고친 것: 주문번호를 그대로 키로 쓰던 방식 */
  const oldKey = (orderValue: unknown) => String(orderValue ?? '');

  it('주문번호가 빈 두 행이 있으면 예전 키는 겹쳤다', () => {
    const rows = [
      { order: '', name: '김철수', address: '서울 강남구' },
      { order: '', name: '박영희', address: '서울 서초구' },
    ];

    // 중복 제거는 주문번호가 비면 지우지 않으므로 둘 다 살아남는다
    const { items } = dedupeByOrderNumber(rows, (r) => r.order);
    expect(items).toHaveLength(2);

    // 둘 다 지역이 읽히는 행이라 배정 대상이다 (누가 받을지는 설정에 달렸다)
    expect(detectRegion(rows[0].address)).toBe('서울');
    expect(detectRegion(rows[1].address)).toBe('서울');

    // 예전 방식: 키가 겹쳐 한 명을 고르면 다른 한 명까지 같이 바뀐다
    expect(oldKey(rows[0].order)).toBe(oldKey(rows[1].order));

    // 지금 방식: 갈라진다
    expect(pendingRowKey(rows[0].order, 0)).not.toBe(pendingRowKey(rows[1].order, 1));
  });

  it('주문번호가 있는 행끼리는 예전에도 지금도 겹치지 않는다', () => {
    // 중복 제거가 같은 주문번호를 이미 걸러내므로 남은 것끼리는 유일하다
    const rows = [{ order: '1001' }, { order: '1002' }];
    const { items } = dedupeByOrderNumber(rows, (r) => r.order);
    const keys = items.map((r, i) => pendingRowKey(r.order, i));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('분류와 배포가 같은 키를 얻는가', () => {
  it('같은 행 목록이면 양쪽이 만든 키가 일치한다', () => {
    // 분류는 객체(헤더명 접근), 배포는 배열(인덱스 접근)로 같은 행을 다룬다.
    // 표현이 달라도 키는 같아야 화면에서 고른 값이 배포에서 찾아진다.
    const asObjects = [
      { 주문번호: '1001' },
      { 주문번호: '' },
      { 주문번호: '1003' },
    ];
    const asArrays = [['1001'], [''], ['1003']];

    const classifyKeys = asObjects.map((row, i) => pendingRowKey(row['주문번호'], i));
    const deployKeys = asArrays.map((row, i) => pendingRowKey(row[0], i));

    expect(classifyKeys).toEqual(deployKeys);
    expect(classifyKeys).toEqual(['1001', '#1', '1003']);
  });
});

describe('주문번호 없음 판정', () => {
  it('빈 값·공백·null·undefined를 모두 없는 것으로 본다', () => {
    expect(isOrderNumberMissing('')).toBe(true);
    expect(isOrderNumberMissing('   ')).toBe(true);
    expect(isOrderNumberMissing(null)).toBe(true);
    expect(isOrderNumberMissing(undefined)).toBe(true);
  });

  it('값이 있으면 없는 것으로 보지 않는다', () => {
    expect(isOrderNumberMissing('20796767')).toBe(false);
    expect(isOrderNumberMissing(20796767)).toBe(false);
    expect(isOrderNumberMissing(' 1001 ')).toBe(false);
    // 0은 값이 있는 것이다. falsy로 판정하면 멀쩡한 건이 막힌다.
    expect(isOrderNumberMissing(0)).toBe(false);
    expect(isOrderNumberMissing('0')).toBe(false);
  });
});
