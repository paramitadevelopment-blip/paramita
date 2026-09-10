/**
 * 기간 조회 — 여러 배포 파일의 행을 한 표로 합친다.
 *
 * 파일은 배포 단위(날짜·보험사·소속)로 쪼개져 저장된다. 그래서 "이달 우리
 * 지사에 온 고객"을 보려면 파일을 하나씩 열어야 했다. 여기서는 기간에 든
 * 파일들의 행을 한 표로 이어 붙인다 — 어느 파일에서 왔는지는 배포일·소속
 * 열로 남긴다.
 *
 * 순수 계산이라 lib에 둔다. 권한·조회는 API가, 표는 화면이 맡는다.
 */

/** 한 배포 파일에서 합치는 데 필요한 만큼. */
export interface RangeSourceFile {
  name: string;
  /** 배포된 시각(uploaded_at). 표에서는 날짜만 보인다. */
  uploadedAt: string;
  /** 그 파일을 받은 소속. 못 읽으면 null */
  department: string | null;
  /**
   * 그 파일의 보험사. 파일 하나는 한 보험사다(배포가 날짜×보험사×소속으로 쪼갠다).
   * 옛 파일은 비어 있을 수 있어 null 을 받는다.
   */
  insurer?: 'hk' | 'dy' | null;
  /** 배포할 때 저장해 둔 행들(file_content). 열 이름 → 값 */
  rows: Array<Record<string, unknown>>;
}

export interface MergedRows {
  headers: string[];
  rows: unknown[][];
}

/** 표 맨 앞에 붙는 열. 파일에는 없고 합치면서 생긴다. */
export const RANGE_SEQ_COLUMN = '번호';
export const RANGE_DAY_COLUMN = '배포일';
export const RANGE_DEPT_COLUMN = '소속';

/** ISO 시각을 한국 날짜 'YYYY-MM-DD'로. 자정 근처 건이 전날로 밀리지 않게 한국 시간으로 자른다. */
export function koreanDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const shifted = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * 파일들의 행을 한 표로.
 *
 * 열은 **처음 나온 순서**를 지킨다. 파일마다 열 구성이 조금 달라도(옵션 열이
 * 있는 파일·없는 파일) 같은 이름은 같은 자리에 오고, 없는 값은 빈칸이다.
 * `hide`에 든 열은 빼고 낸다 — 관리자에게만 보이는 열을 여기서 거른다.
 *
 * 순서는 배포일 오름차순, 같은 파일 안에서는 저장된 순서 그대로다.
 */
export function mergeRangeRows(files: RangeSourceFile[], hide: readonly string[] = []): MergedRows {
  const hidden = new Set(hide);
  // 파일 안의 '번호'는 그 파일 안에서만 뜻이 있다. 합치면 다시 센다.
  hidden.add(RANGE_SEQ_COLUMN);

  const keys: string[] = [];
  const seen = new Set<string>();
  const sorted = [...files].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));

  for (const file of sorted) {
    for (const row of file.rows) {
      for (const key of Object.keys(row)) {
        if (hidden.has(key) || seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
      }
    }
  }

  const headers = [RANGE_SEQ_COLUMN, RANGE_DAY_COLUMN, RANGE_DEPT_COLUMN, ...keys];
  const rows: unknown[][] = [];
  let seq = 0;
  for (const file of sorted) {
    const day = koreanDay(file.uploadedAt);
    for (const row of file.rows) {
      seq += 1;
      rows.push([seq, day, file.department ?? '', ...keys.map((key) => row[key] ?? '')]);
    }
  }

  return { headers, rows };
}

/**
 * 소속별로 몇 건 받았나. 많은 순.
 *
 * 관리자가 기간 조회를 여는 이유의 절반은 이것이다 — "이달 어느 지사에
 * 몇 건 갔나". 표를 세로로 훑어 세게 두면 안 된다. 소속을 못 읽은 파일은
 * '소속 없음'으로 따로 센다. 조용히 빼면 합이 표와 안 맞는다.
 */
export interface DepartmentCount {
  department: string;
  count: number;
  /** 그 소속의 하루 평균. 기간 달력 날짜로 나눈다 */
  dailyAverage: number;
  /** 그 안에서 보험사별로 몇 건인지 */
  byInsurer: InsurerCount;
}

/**
 * 보험사별 건수.
 *
 * 소속마다 "동양이 많나 흥국이 많나"를 같이 본다 — 지사에 몇 건 갔는지
 * 다음으로 묻는 것이 이것이다. 파일 단위로 센다: 배포는 날짜×보험사×소속으로
 * 쪼개므로 파일 하나는 한 보험사이고, 행을 하나씩 들여다볼 것이 없다.
 * 보험사를 못 읽은 옛 파일은 etc 로 따로 센다 — 조용히 빼면 합이 안 맞는다.
 */
export interface InsurerCount {
  dy: number;
  hk: number;
  etc: number;
}

function addInsurer(into: InsurerCount, file: RangeSourceFile): void {
  const key = file.insurer === 'dy' || file.insurer === 'hk' ? file.insurer : 'etc';
  into[key] += file.rows.length;
}

const emptyInsurer = (): InsurerCount => ({ dy: 0, hk: 0, etc: 0 });

export function countByDepartment(files: RangeSourceFile[], days: number): DepartmentCount[] {
  const counts = new Map<string, { count: number; byInsurer: InsurerCount }>();
  for (const file of files) {
    const dept = file.department ?? '소속 없음';
    let at = counts.get(dept);
    if (!at) {
      at = { count: 0, byInsurer: emptyInsurer() };
      counts.set(dept, at);
    }
    at.count += file.rows.length;
    addInsurer(at.byInsurer, file);
  }
  return [...counts.entries()]
    .map(([department, { count, byInsurer }]) => ({
      department,
      count,
      dailyAverage: dailyAverage(count, days),
      byInsurer,
    }))
    .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department, 'ko'));
}

/** 기간 전체의 보험사별 건수. 소속을 가리지 않고 센다. */
export function countByInsurer(files: RangeSourceFile[]): InsurerCount {
  const total = emptyInsurer();
  for (const file of files) addInsurer(total, file);
  return total;
}

/**
 * 하루 평균. 기간의 달력 날짜 수로 나눈다(양 끝 포함).
 *
 * 배포가 없던 날도 분모에 든다 — "이달 하루에 몇 건씩 오나"가 물음이지
 * "배포한 날만 따지면"이 아니다. 소수 첫째 자리까지.
 */
export function dailyAverage(total: number, days: number): number {
  if (days <= 0) return 0;
  return Math.round((total / days) * 10) / 10;
}

/** 'YYYY-MM-DD' 꼴이고 실제 있는 날인가. */
export function isDayString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** 두 날 사이의 일수(양 끝 포함). from이 to보다 뒤면 0 이하. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.floor((b - a) / (24 * 60 * 60 * 1000)) + 1;
}

/** 한국 시간 기준 그 기간의 시각 범위. DB의 timestamptz와 견줄 값이다. */
export function koreanDayBounds(from: string, to: string): { start: string; end: string } {
  return { start: `${from}T00:00:00+09:00`, end: `${to}T23:59:59.999+09:00` };
}
