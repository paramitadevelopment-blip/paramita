import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 민원이 지사를 오간 이력.
 *
 * 민원 행에는 **지금 지사 하나**만 남는다. 옮기는 순간 앞의 지사는 덮이므로,
 * 한 건이 어디를 거쳐 왔는지는 여기 남기지 않으면 사라진다. 잘못 간 민원이
 * 오갈 때 "누가 어디로 보냈고 누가 왜 되돌렸나"가 곧 그 건의 사정이다.
 *
 * 남기지 못해도 배정 자체는 되게 둔다 — 이력 한 줄 때문에 민원이 안 넘어가면
 * 그게 더 큰 일이다. 대신 흔적을 남겨 나중에 볼 수 있게 한다.
 */

export type TransferKind = 'auto' | 'assign' | 'move' | 'bounce';

export const TRANSFER_KIND_LABEL: Record<TransferKind, string> = {
  auto: '자동 배정',
  assign: '관리자 지정',
  move: '관리자가 옮김',
  bounce: '지사가 되돌림',
};

export interface ComplaintTransfer {
  kind: TransferKind;
  from_group: string | null;
  to_group: string | null;
  reason: string | null;
  by_name: string;
  at: string;
}

export interface RecordTransferInput {
  complaintId: number;
  kind: TransferKind;
  /** 어디서 왔나. 처음 배정이면 null */
  from?: string | null;
  /** 어디로 갔나. 되돌린 것이면 null(관리자 앞) */
  to?: string | null;
  reason?: string | null;
  byId?: number | null;
  byName: string;
  at?: string;
}

export async function recordTransfer(
  supabase: SupabaseClient,
  input: RecordTransferInput
): Promise<void> {
  const { error } = await supabase.from('complaint_transfers').insert({
    complaint_id: input.complaintId,
    kind: input.kind,
    from_group: input.from ?? null,
    to_group: input.to ?? null,
    reason: input.reason ?? null,
    by_id: input.byId ?? null,
    by_name: input.byName,
    at: input.at ?? new Date().toISOString(),
  });
  if (error) console.error('Complaint transfer log error:', error);
}

/**
 * 이 건을 "우리 건 아니다"로 되돌린 적 있는 지사들.
 *
 * 그 지사로는 기록만 믿고 다시 자동 배정하지 않는다 — 되돌리고 고치고를
 * 되풀이하게 된다. 관리자가 손으로 다시 보내는 것은 사람의 판단이라 따른다.
 */
export function refusedGroups(transfers: Array<{ kind: string; from_group: string | null }>): Set<string> {
  return new Set(
    transfers
      .filter((t) => t.kind === 'bounce' && t.from_group)
      .map((t) => String(t.from_group))
  );
}

/** 한 줄로 읽는 이력. '한울부원 → 경기' 꼴로, 없는 쪽은 '관리자'로 적는다. */
export function transferPath(transfer: { from_group: string | null; to_group: string | null }): string {
  return `${transfer.from_group ?? '관리자'} → ${transfer.to_group ?? '관리자'}`;
}
