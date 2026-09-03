import { normalizePhone } from '@/lib/insurance';
import {
  findLastAssignment,
  isAssignedRecord,
  type AssignmentRecord,
  type LastAssignment,
} from '@/lib/lastAssignment';

/**
 * 민원 한 건을 어느 지사로 넘길지 찾는다.
 *
 * 민원담당자가 메일로 받은 내역을 옮겨 적으면, 그 사람을 우리가 언제 어느
 * 지사로 넘겼는지 과거 기록에서 되짚어 그 지사에게 보낸다.
 *
 * 찾는 순서가 둘인 이유:
 *   1) 주문번호 — 바로 그 신청 건을 가리킨다. 동명이인도 번호 바뀐 사람도 없다.
 *   2) 이름 + 전화번호 — 메일에 주문번호가 비어 있거나, 우리 기록의 주문번호가
 *      비어 있을 때. 30일 중복·재신청 판정과 같은 기준이라 서로 다른 사람을
 *      가리킬 일이 없다.
 *
 * 둘 다 못 찾으면 null이다. 이때 아무 지사에나 넘기면 그 지사는 자기 고객이
 * 아닌 민원을 받는다 — 사람이 보고 정하도록 관리자에게 남긴다.
 */

/** 무엇으로 찾았는지. 나중에 "왜 이 지사로 갔나"를 되짚는 근거다. */
export type MatchKey = 'order_no' | 'name_phone';

/** 과거 기록 한 줄 중 이 판정에 쓰는 값만. */
export interface MatchRecord extends AssignmentRecord {
  orderNo: string;
}

/** 민원에 적힌, 고객을 찾는 데 쓰는 값. */
export interface ComplaintTarget {
  orderNo: string;
  name: string;
  phone: string;
  /**
   * 메일에 적힌 접수일자. 그 신청 이후에 배정된 건은 보지 않는다 —
   * 8월 민원인데 9월에 다시 신청해서 다른 지사로 간 건을 집으면 안 된다.
   */
  receivedAt: Date | null;
}

export interface ComplaintMatch extends LastAssignment {
  matchKey: MatchKey;
}

const text = (v: unknown) => String(v ?? '').trim();

/**
 * 주문번호가 같은 건 중 실제로 지사에 배정된 것.
 *
 * 같은 주문번호가 여러 줄일 수 있다 — 엑셀에 같은 줄이 두 번 들어가면 하나는
 * '중복 제외'로 빠진다. 배정된 쪽만 본다.
 */
function byOrderNo(target: ComplaintTarget, past: MatchRecord[]): MatchRecord | null {
  const orderNo = text(target.orderNo);
  if (!orderNo) return null;

  let best: MatchRecord | null = null;
  for (const record of past) {
    if (text(record.orderNo) !== orderNo) continue;
    if (!isAssignedRecord(record)) continue;
    // 같은 주문번호가 여러 줄이면 나중에 처리된 것을 쓴다.
    if (!best || record.uploadedAt > best.uploadedAt) best = record;
  }
  return best;
}

/**
 * @param past 과거 배포 기록. 기간을 어디까지 볼지는 부르는 쪽 책임이다 —
 *             민원은 몇 달 전 고객도 들어오므로 중복 판정(30일)보다 넓게 본다.
 */
export function matchComplaint(
  target: ComplaintTarget,
  past: MatchRecord[]
): ComplaintMatch | null {
  const byOrder = byOrderNo(target, past);
  if (byOrder) {
    return {
      matchKey: 'order_no',
      dept: text(byOrder.assignedTo),
      at: byOrder.receivedAt ?? byOrder.assignedAt ?? byOrder.uploadedAt,
      fileId: byOrder.fileId ?? null,
      fileName: byOrder.fileName ?? null,
    };
  }

  const name = text(target.name);
  const phone = normalizePhone(target.phone);
  if (!name || !phone) return null;

  /*
   * 이름·전화번호 판정은 재신청 알림과 같은 함수를 쓴다. 여기서만 따로
   * 구현하면 "재신청은 이 지사라는데 민원은 저 지사로 갔다"가 생긴다.
   *
   * 민원에는 배정 결과가 없으므로 판정에 쓰이지 않는 칸은 비워 보낸다.
   */
  const found = findLastAssignment(
    {
      name,
      tel1: phone,
      tel2: '',
      assignedTo: '',
      receivedAt: target.receivedAt,
      uploadedAt: target.receivedAt ?? new Date(),
    },
    past
  );

  return found ? { ...found, matchKey: 'name_phone' } : null;
}
