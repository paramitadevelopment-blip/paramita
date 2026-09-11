import { collectAddedRows, collectMovedRows, type PickableFile, type RowPicks } from '@/lib/pendingPicks';

/**
 * 오늘 합계 — 오늘 이미 배포한 건과 지금 창에 올린 파일을 합쳐 지사×보험사로 센다.
 *
 * 흥국·동양을 따로, 여러 번에 나눠 배포하므로 파일 한 장의 숫자만 봐서는
 * 지사별 균형을 맞출 수 없다. 배포 직전에 "오늘 이 지사에 몇 건이 되나"를 본다.
 */

export type InsurerKey = 'hk' | 'dy' | 'etc';
export type InsurerCounts = Record<InsurerKey, number>;

export const emptyCounts = (): InsurerCounts => ({ hk: 0, dy: 0, etc: 0 });

/** 파일 한 장. 분류 결과(ClassifiedFile)가 이 모양을 만족한다. */
export interface BatchFile extends PickableFile {
  insurerType?: 'hk' | 'dy' | null;
  classificationByDeptId: Record<number, number>;
}

/**
 * 이번 배포로 나갈 건수. 소속명 → 보험사별 건수.
 *
 * '선택 반영' 칸과 같은 셈이다 — 규칙이 보낸 것에서 사람이 옮긴 것을 빼고,
 * 고르거나 옮겨 온 것을 더한다. 규칙 숫자로 세면 배포되는 숫자와 어긋난다.
 * 파일은 한 장이 한 보험사다. 보험사를 못 가린 파일은 etc 로 센다.
 */
export function batchCountsByDept(
  files: BatchFile[],
  picks: RowPicks,
  departments: ReadonlyArray<{ id: number; name: string }>
): Record<string, InsurerCounts> {
  const out: Record<string, InsurerCounts> = {};
  files.forEach((file, i) => {
    const key: InsurerKey = file.insurerType === 'hk' || file.insurerType === 'dy' ? file.insurerType : 'etc';
    const added = collectAddedRows(file, picks[i]) ?? {};
    const moved = collectMovedRows(file, picks[i]) ?? {};
    for (const dept of departments) {
      const n =
        (file.classificationByDeptId[dept.id] ?? 0) -
        (moved[dept.name]?.length ?? 0) +
        (added[dept.name]?.length ?? 0);
      if (n === 0) continue;
      (out[dept.name] ??= emptyCounts())[key] += n;
    }
  });
  return out;
}

export interface TotalsRow {
  department: string;
  /** 오늘 이미 배포한 건 */
  done: InsurerCounts;
  /** 이번 배포로 더해질 건 */
  batch: InsurerCounts;
}

/**
 * 표에 올릴 줄. 소속 차례는 넘겨준 이름 순서를 따르고, 거기 없는데 오늘 배포된
 * 소속(옛 소속명·'소속 없음')은 뒤에 붙인다 — 빼면 합계가 실제 배포와 안 맞는다.
 */
export function mergeTodayTotals(
  departmentNames: string[],
  done: ReadonlyArray<{ department: string; byInsurer: InsurerCounts }>,
  batch: Record<string, InsurerCounts>
): TotalsRow[] {
  const doneBy = new Map(done.map((d) => [d.department, d.byInsurer]));
  const names = [...departmentNames];
  for (const name of [...doneBy.keys(), ...Object.keys(batch)]) {
    if (!names.includes(name)) names.push(name);
  }
  return names.map((department) => ({
    department,
    done: { ...emptyCounts(), ...doneBy.get(department) },
    batch: { ...emptyCounts(), ...batch[department] },
  }));
}
