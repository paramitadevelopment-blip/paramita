import { calculateInsuranceAge, findRequiredColumns } from '@/lib/insurance';
import { koreanDay, type InsurerCount, type RangeSourceFile } from '@/lib/rangeRows';

/**
 * 기간 조회 — 나이 구간별 건수.
 *
 * 파라인슈만 "받은 건 중 70세 이하가 몇 건, 71세 이상이 몇 건인가"를 보험사마다
 * 따로 본다. 선은 운영 요청대로 70세 이하 / 71세 이상이다 — 배정 규칙
 * (resolveDeptName: 70세 미만 / 이상)과는 한 살 다르다. 보험나이 70세는 여기서
 * '이하' 쪽이다.
 *
 * 나이는 보험나이, 기준일은 **배포한 날**이다. 오늘로 재면 같은 기간을 다시
 * 조회할 때마다 생일이 지난 사람이 옮겨 가 숫자가 흔들린다.
 */

/** 이 나이까지 '이하' 쪽. 넘으면 '이상' 쪽이다 */
export const AGE_UNDER_MAX = 70;

/** 화면에 보이는 구간 이름 */
export const AGE_LABEL = { under: `${AGE_UNDER_MAX}세 이하`, over: `${AGE_UNDER_MAX + 1}세 이상` } as const;

/** 나이 구간을 보이는 소속 */
export const AGE_SPLIT_DEPARTMENTS: readonly string[] = ['파라인슈'];

export interface AgeSplit {
  /** 70세 이하 */
  under: number;
  /** 71세 이상 */
  over: number;
  /** 생년월일을 못 읽은 건. 빼면 합이 보험사 건수와 안 맞는다 */
  unknown: number;
}

export type InsurerAgeSplit = Record<keyof InsurerCount, AgeSplit>;

const emptySplit = (): AgeSplit => ({ under: 0, over: 0, unknown: 0 });

/**
 * 배포한 날(한국 날짜)의 0시.
 *
 * calculateInsuranceAge는 지역 시각으로 날짜를 읽는다. 서버는 UTC라
 * uploaded_at을 그대로 넘기면 한국 새벽 배포분이 전날로 읽힌다.
 * 한국 날짜를 먼저 자르고 그 날짜로 Date를 만든다.
 */
function deployDay(uploadedAt: string): Date | null {
  const day = koreanDay(uploadedAt);
  if (!day) return null;
  return new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));
}

/** 파일들의 행을 보험사 × 나이 구간으로 센다. 파일 하나는 한 보험사다. */
export function countAgeSplit(files: RangeSourceFile[]): InsurerAgeSplit {
  const out: InsurerAgeSplit = { dy: emptySplit(), hk: emptySplit(), etc: emptySplit() };
  for (const file of files) {
    const key = file.insurer === 'dy' || file.insurer === 'hk' ? file.insurer : 'etc';
    const base = deployDay(file.uploadedAt);
    // 한 파일 안의 행은 열 구성이 같다. 생년월일 열은 파일마다 한 번만 찾는다.
    const juminCol = file.rows[0] ? findRequiredColumns(Object.keys(file.rows[0])).juminCol : null;
    for (const row of file.rows) {
      const age = juminCol && base ? calculateInsuranceAge(String(row[juminCol] ?? ''), base) : -1;
      if (age < 0) out[key].unknown += 1;
      else if (age <= AGE_UNDER_MAX) out[key].under += 1;
      else out[key].over += 1;
    }
  }
  return out;
}
