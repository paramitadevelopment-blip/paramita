import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/insurance';
import { findLastAssignment, type AssignmentRecord } from '@/lib/lastAssignment';

/**
 * 재신청 고객 알림 쓰기.
 *
 * 30일 중복이나 블랙리스트로 배정에서 빠진 건을, 그 사람을 직전에 받았던
 * 지사에게 남긴다. 지금은 이런 건이 조용히 사라져서, 지사는 자기가 받았던
 * 고객이 다시 신청한 것을 알 방법이 없다.
 *
 * 주문번호 중복(중복1)은 넣지 않는다. 같은 줄이 두 번 들어온 것이지
 * 다시 신청한 게 아니다.
 */

/** 이번에 빠진 한 건 */
export interface ReapplyCandidate {
  customerName: string;
  birth: string;
  tel1: string;
  tel2: string;
  product: string;
  reason: string;
  orderNo: string;
  sourceFileId: string | null;
  sourceFileName: string | null;
  /**
   * 고객이 실제로 신청한 날(접수일자). 우리가 배포한 날이 아니다 —
   * 밀렸다가 한꺼번에 올리면 배포일은 다 같은데 신청일은 제각각이다.
   * 못 읽으면 null이고, 그때는 배포 시각으로 물러선다.
   */
  receivedAt: Date | null;
}

/** 배정 분류('파라인슈1') → 사용자 소속('파라인슈') */
export type GroupResolver = (dept: string) => string | null;

/**
 * 알림을 만든다.
 *
 * @param past       과거 60일 기록. 직전 배정을 여기서 찾는다
 * @param toGroup    배정 분류를 사용자 소속으로 바꾼다. 못 바꾸면 null
 * @param deployedAt 이번 배포 시각. 접수일자를 못 읽은 건만 이걸 쓴다
 * @returns 실제로 쌓인 건수. 직전 배정이 없는 사람은 세지 않는다
 */
export async function recordReapplyNotices(
  supabase: SupabaseClient,
  candidates: ReapplyCandidate[],
  past: AssignmentRecord[],
  toGroup: GroupResolver,
  deployedAt: Date
): Promise<{ saved: number; skipped: number }> {
  if (candidates.length === 0) return { saved: 0, skipped: 0 };

  const rows: any[] = [];
  let skipped = 0;

  for (const c of candidates) {
    const last = findLastAssignment(
      {
        name: c.customerName,
        tel1: c.tel1,
        tel2: c.tel2,
        assignedTo: '',
        // 이번 신청일. 이보다 앞선 건만 '이전 신청'으로 친다.
        receivedAt: c.receivedAt,
        uploadedAt: deployedAt,
      },
      past
    );

    // 앞서 배정된 적이 없으면 알릴 지사가 없다. 조용히 넘긴다.
    if (!last) {
      skipped++;
      continue;
    }

    const group = toGroup(last.dept);
    if (!group) {
      // 소속 표에 없는 배정 분류다. 누구에게 보여줄지 정할 수 없다.
      skipped++;
      continue;
    }

    const phoneKeys = Array.from(
      new Set([normalizePhone(c.tel1), normalizePhone(c.tel2)].filter(Boolean))
    );

    rows.push({
      customer_name: c.customerName || null,
      birth: c.birth || null,
      tel1: normalizePhone(c.tel1) || null,
      tel2: normalizePhone(c.tel2) || null,
      phone_keys: phoneKeys,
      product_name: c.product || null,
      reason: c.reason,
      order_no: c.orderNo || null,
      source_file_id: c.sourceFileId,
      source_file_name: c.sourceFileName,
      applied_at: (c.receivedAt ?? deployedAt).toISOString(),
      assigned_dept: last.dept,
      assigned_group: group,
      previous_applied_at: last.at.toISOString(),
      assigned_file_id: last.fileId,
      assigned_file_name: last.fileName,
    });
  }

  if (rows.length === 0) return { saved: 0, skipped };

  const { error } = await supabase.from('reapply_notices').insert(rows);
  if (error) {
    // 실패해도 배포를 되돌리지 않는다. 이번 건은 이미 배정에서 빠졌고,
    // 배포가 반쯤 되다 마는 게 더 나쁘다. 블랙리스트 등록과 같은 원칙이다.
    console.error('Failed to record reapply notices:', error);
    return { saved: 0, skipped };
  }

  return { saved: rows.length, skipped };
}
