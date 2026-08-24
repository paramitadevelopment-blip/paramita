import { describe, it, expect } from 'vitest';
import { resolveDeployGate, isClassifiableFileName, type DeployGateInput } from '@/lib/deployGate';
import { summarizeErrors } from '@/lib/classifyErrors';

/**
 * 배포 버튼을 여는 조건 검증.
 *
 * 잘못 열리면 오류가 있거나 소속을 안 고른 건이 그대로 나간다.
 * 잘못 닫히면 멀쩡한 파일을 배포하지 못한다.
 */

/** 오류도 없고 다 골라 놓은, 배포가 열려야 하는 기본 상태 */
const base: DeployGateInput = { busy: null, errorCount: 0, unpickedRegions: [], fileCount: 1 };

describe('배포 버튼 상태', () => {
  it('오류 없고 다 골랐으면 열린다', () => {
    const { label, reason, disabled } = resolveDeployGate({ ...base });
    expect(label).toBe('배포하기');
    expect(reason).toBe('');
    expect(disabled).toBe(false);
  });

  it('오류가 하나라도 있으면 막고 건수를 보여준다', () => {
    const { label, reason, disabled } = resolveDeployGate({ ...base, errorCount: 3 });
    expect(disabled).toBe(true);
    expect(label).toBe('3개 오류 (배포 불가)');
    expect(reason).toBe('3개 행에 오류가 있어 배포할 수 없습니다.');
  });

  it('소속을 안 고른 건이 있으면 막고 어느 지역인지 알려준다', () => {
    const { label, reason, disabled } = resolveDeployGate({
      ...base,
      unpickedRegions: ['서울', '강원'],
    });
    expect(disabled).toBe(true);
    expect(label).toBe('2개 지역 배정 필요');
    expect(reason).toBe('배정 부서를 안 고른 지역: 서울, 강원');
  });

  it('오류가 선택보다 먼저 보인다 — 오류는 파일을 고쳐야 풀린다', () => {
    const { label } = resolveDeployGate({ ...base, errorCount: 2, unpickedRegions: ['서울'] });
    expect(label).toBe('2개 오류 (배포 불가)');
  });

  it('분류된 파일이 없으면 막는다 — 배포할 게 없다', () => {
    expect(resolveDeployGate({ ...base, fileCount: 0 }).disabled).toBe(true);
  });

  it('돌고 있는 동안에는 단계 이름을 보여주고 막는다', () => {
    for (const busy of ['분류', '업로드', '배포'] as const) {
      const { label, disabled } = resolveDeployGate({ ...base, busy });
      expect(label).toBe(`${busy} 중...`);
      expect(disabled).toBe(true);
    }
  });

  it('돌고 있으면 배포 가능한 상태여도 막는다 — 두 번 누르면 두 번 나간다', () => {
    expect(resolveDeployGate({ ...base, busy: '배포' }).disabled).toBe(true);
  });
});

describe('분류에 보낼 수 있는 파일', () => {
  it('엑셀과 csv는 보낸다', () => {
    for (const name of ['a.xlsx', 'b.xls', 'c.csv']) {
      expect(isClassifiableFileName(name)).toBe(true);
    }
  });

  it('확장자 대소문자는 가리지 않는다', () => {
    expect(isClassifiableFileName('20260816동양생명.XLSX')).toBe(true);
    expect(isClassifiableFileName('A.CSV')).toBe(true);
  });

  it('그 밖의 파일은 보내지 않는다 — 서버가 못 읽어 오류만 난다', () => {
    for (const name of ['a.pdf', 'b.txt', 'c.png', 'xlsx', 'a.xlsx.exe']) {
      expect(isClassifiableFileName(name)).toBe(false);
    }
  });
});

describe('오류 요약 문장', () => {
  const file = (fileName: string, errors: Array<{ row: number; reason: string }>) => ({
    fileName,
    errorCount: errors.length,
    errors,
  });

  it('사유별로 묶어 몇 번째 행인지까지 알려준다', () => {
    const text = summarizeErrors([
      file('a.xlsx', [
        { row: 3, reason: '주문번호 없음' },
        { row: 7, reason: '주문번호 없음' },
        { row: 9, reason: '주소를 알 수 없음' },
      ]),
    ]);
    expect(text).toContain('주문번호 없음 — 2건 (3, 7행)');
    expect(text).toContain('주소를 알 수 없음 — 1건 (9행)');
  });

  it('파일이 하나면 파일명 줄은 넣지 않는다', () => {
    const text = summarizeErrors([file('a.xlsx', [{ row: 1, reason: 'X' }])]);
    expect(text).not.toContain('[a.xlsx]');
  });

  it('파일이 여럿이면 어느 파일인지 밝힌다', () => {
    const text = summarizeErrors([
      file('a.xlsx', [{ row: 1, reason: 'X' }]),
      file('b.xlsx', [{ row: 2, reason: 'Y' }]),
    ]);
    expect(text).toContain('[a.xlsx]');
    expect(text).toContain('[b.xlsx]');
  });

  it('오류 없는 파일은 건너뛴다', () => {
    const text = summarizeErrors([file('clean.xlsx', []), file('a.xlsx', [{ row: 1, reason: 'X' }])]);
    expect(text).not.toContain('clean.xlsx');
  });

  it('같은 사유가 많으면 앞 5개만 짚고 나머지는 건수로 접는다', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8].map((row) => ({ row, reason: '주문번호 없음' }));
    const text = summarizeErrors([file('a.xlsx', rows)]);
    expect(text).toContain('(1, 2, 3, 4, 5행 외 3건)');
  });

  it('사유가 너무 많으면 6가지까지만 늘어놓는다', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ row: i + 1, reason: `사유${i + 1}` }));
    const text = summarizeErrors([file('a.xlsx', rows)]);
    expect(text).toContain('사유6');
    expect(text).not.toContain('사유7 —');
    expect(text).toContain('그 밖에 3가지 사유가 더 있습니다.');
  });

  it('오류가 없으면 빈 문자열이다', () => {
    expect(summarizeErrors([])).toBe('');
    expect(summarizeErrors([file('a.xlsx', [])])).toBe('');
  });
});
