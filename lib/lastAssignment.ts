import { normalizePhone } from '@/lib/insurance';

/**
 * 이 사람을 직전에 실제로 받았던 지사를 찾는다.
 *
 * 30일 중복으로 매칭된 그 행이 자기도 '중복 제외'였을 수 있다. 그러면 알려줄
 * 지사가 없다. 그래서 매칭된 행을 쓰지 않고, 그 사람의 과거 기록 중
 * **실제로 지사에 배정된 가장 최근 건**을 따로 찾는다.
 *
 *   8/01  홍길동 → 파라인슈1 배정
 *   8/15  홍길동 → 중복 제외      (8/01 건과 중복)
 *   8/26  홍길동 → 중복 제외      (8/15 건과 중복)  ← 이번 건
 *
 * 8/15가 아니라 8/01의 파라인슈1에게 알린다.
 *
 * 같은 사람인지는 **이름 + 전화번호 겹침**으로 본다. 30일 중복 판정과 같은
 * 기준이다 — 여기서만 다른 기준을 쓰면 "중복이라 뺐다"와 "누구에게 알린다"가
 * 서로 다른 사람을 가리키게 된다.
 */

/** 배정 결과가 지사가 아닌 값들. 이 행은 어디에도 안 갔다. */
const NOT_ASSIGNED = new Set(['중복 제외', '블랙리스트', '오류', '']);

/** 과거 기록 한 줄 중 이 판정에 쓰는 값만. */
export interface AssignmentRecord {
  name: string;
  tel1: string;
  tel2: string;
  /** 배정소속 열. '파라인슈1' 같은 배정 분류이거나 '중복 제외'다. */
  assignedTo: string;
  /**
   * 그때 고객이 신청한 날(접수일자 열).
   *
   * 배정날짜가 아니라 이걸 쓴다. 이번 신청일도 접수일자라, 축이 다르면
   * "8/12에 신청했는데 8/25에 배정됐다"처럼 앞뒤가 뒤집혀 비교가 안 된다.
   */
  receivedAt?: Date | null;
  /** 배정날짜 열. 접수일자를 못 읽었을 때 물러설 자리다. */
  assignedAt?: Date | null;
  /** 파일이 올라온 시각. 앞의 둘을 다 못 읽었을 때 마지막으로 쓴다. */
  uploadedAt: Date;
  fileId?: string | null;
  fileName?: string | null;
}

/** 알림에 실을 직전 배정 정보 */
export interface LastAssignment {
  dept: string;
  /** 그때 신청한 날. 이번 신청일과 같은 축이라 나란히 놓고 볼 수 있다. */
  at: Date;
  fileId: string | null;
  fileName: string | null;
}

const text = (v: unknown) => String(v ?? '').trim().toLowerCase();

/**
 * 이 행이 신청된 날.
 *
 * 접수일자를 먼저 쓰고, 없으면 배정날짜, 그것도 없으면 파일이 올라온 시각으로
 * 물러선다. 앞의 것일수록 고객이 실제로 신청한 시점에 가깝다.
 */
function whenApplied(record: AssignmentRecord): Date {
  return record.receivedAt ?? record.assignedAt ?? record.uploadedAt;
}

/** 이 행이 실제로 지사에 배정됐는가 */
export function isAssignedRecord(record: AssignmentRecord): boolean {
  return !NOT_ASSIGNED.has(String(record.assignedTo ?? '').trim());
}

function phonesOf(record: { tel1: string; tel2: string }): string[] {
  return Array.from(new Set([normalizePhone(record.tel1), normalizePhone(record.tel2)].filter(Boolean)));
}

/**
 * 이름이 같고 번호가 하나라도 겹치는가.
 *
 * 번호를 묶음으로 보는 이유는 같은 사람이 Tel1·Tel2 중 어느 칸에 넣느냐에 따라
 * 값이 어긋나기 때문이다 (중복3이 있는 것과 같은 이유).
 */
function isSameCustomer(a: AssignmentRecord, b: AssignmentRecord): boolean {
  const name = text(a.name);
  if (!name || name !== text(b.name)) return false;

  const mine = new Set(phonesOf(a));
  if (mine.size === 0) return false;
  return phonesOf(b).some((phone) => mine.has(phone));
}

/**
 * @param target 이번에 빠진 행. receivedAt 이 이번 신청일이다
 * @param past   과거 기록 (기간은 부르는 쪽 책임)
 * @returns 직전 배정. 없으면 null — 그때는 알림을 만들지 않는다.
 *
 * **이번보다 앞서 신청된 건만 본다.** 같은 날짜면 다시 신청한 게 아니라
 * 같은 신청서가 두 번 들어온 것이다. 같은 파일을 두 번 올리면 그런 행이
 * 통째로 생기는데, 그걸 "또 신청했다"고 지사에 알리면 잘못된 정보다.
 */
export function findLastAssignment(
  target: AssignmentRecord,
  past: AssignmentRecord[]
): LastAssignment | null {
  let best: AssignmentRecord | null = null;
  const 이번신청일 = whenApplied(target);

  for (const record of past) {
    if (!isAssignedRecord(record)) continue;
    if (!isSameCustomer(target, record)) continue;
    // 같은 날이거나 나중이면 이전 신청이 아니다.
    if (whenApplied(record) >= 이번신청일) continue;
    // 가장 최근 것 하나만 남긴다. 정렬해서 찾으면 과거 전체를 훑을 때마다
    // 정렬 비용이 붙는데, 최댓값 하나를 고르는 데는 한 번 훑으면 된다.
    if (!best || whenApplied(record) > whenApplied(best)) best = record;
  }

  if (!best) return null;

  return {
    dept: String(best.assignedTo).trim(),
    at: whenApplied(best),
    fileId: best.fileId ?? null,
    fileName: best.fileName ?? null,
  };
}
