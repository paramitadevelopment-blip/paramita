import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeProductName, normalizePhone, normalizeBirth } from '@/lib/insurance';
import type { BlacklistKey } from '@/lib/blacklist';

/**
 * 블랙리스트 명단 읽기·쓰기.
 *
 * 명단은 기간 제한이 없다. 한 번 오르면 영구히 막히는 것이 이 기능의 핵심이라
 * 조회할 때 날짜로 거르지 않는다.
 */

/** 명단 한 줄. 판정용 값과 화면 표시용 값을 함께 담는다. */
export interface BlacklistEntry extends BlacklistKey {
  customerName: string;
  reason: string;
  count: number;
  sourceFileId?: string | null;
  sourceFileName?: string | null;
}

/** 명단 전체를 판정에 쓸 모양으로 읽어온다. */
export async function loadBlacklist(supabase: SupabaseClient): Promise<BlacklistKey[]> {
  const { data, error } = await supabase
    .from('blacklist')
    .select('product_name, birth, tel1, tel2')
    // 해제한 사람은 빼야 한다. 이 조건이 없으면 화면에서 '해제'를 눌러도
    // 배포에서는 그대로 막혀, 오판을 되돌릴 방법이 사라진다.
    .is('released_at', null);

  if (error) {
    // 명단을 못 읽으면 이미 오른 사람이 그대로 배정된다. 조용히 넘기면
    // 영구 차단이 무너지므로 부르는 쪽에서 막을 수 있게 그대로 던진다.
    throw error;
  }

  return (data ?? []).map((row) => ({
    product: String(row.product_name ?? ''),
    birth: String(row.birth ?? ''),
    tel1: String(row.tel1 ?? ''),
    tel2: String(row.tel2 ?? ''),
  }));
}

/**
 * 이번에 걸린 사람들을 명단에 올린다.
 *
 * 실패해도 배포를 막지 않는다 — 이번 건은 이미 차단됐고, 배포가 반쯤 되다 마는
 * 게 더 나쁘다. 다만 다음 번에 다시 걸릴 것이므로 놓쳐도 영구히 새지는 않는다.
 *
 * @returns 실제로 명단에 오른 사람 수. 같은 사람이 한 파일에 여러 번 걸려도 한 명이다.
 */
export async function registerBlacklist(
  supabase: SupabaseClient,
  entries: BlacklistEntry[]
): Promise<number> {
  if (entries.length === 0) return 0;

  // 같은 사람이 한 파일에 여러 번 걸리면 한 줄만 남긴다.
  const seen = new Set<string>();
  const rows: any[] = [];

  for (const entry of entries) {
    const productKey = normalizeProductName(entry.product);
    // 판정에 쓴 값과 같은 모양으로 저장해야 한다. 원문("9701071******")을
    // 그대로 넣으면 다음 배포에서 정규화된 값("9701071")과 안 맞아
    // 이미 명단에 오른 사람이 그대로 배정된다.
    const birthKey = normalizeBirth(entry.birth);
    const phoneKeys = Array.from(
      new Set([normalizePhone(entry.tel1), normalizePhone(entry.tel2)].filter(Boolean))
    );

    if (!productKey || !birthKey || phoneKeys.length === 0) continue;

    const dedupeKey = `${productKey}|${birthKey}|${phoneKeys.slice().sort().join(',')}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    rows.push({
      product_key: productKey,
      birth_key: birthKey,
      phone_keys: phoneKeys,
      customer_name: entry.customerName || null,
      product_name: entry.product,
      birth: birthKey,
      tel1: normalizePhone(entry.tel1) || null,
      tel2: normalizePhone(entry.tel2) || null,
      reason: entry.reason,
      request_count: entry.count,
      // 배포가 60일 3회 규칙으로 올린 건이다.
      registered_by: 'system',
      source_file_id: entry.sourceFileId ?? null,
      source_file_name: entry.sourceFileName ?? null,
    });
  }

  if (rows.length === 0) return 0;

  const { data, error } = await supabase.from('blacklist').insert(rows).select('id');
  if (error) {
    console.error('Failed to register blacklist entries:', error);
    return 0;
  }

  // 등록 이력. insert 결과는 넣은 순서대로 돌아오므로 같은 자리의 행과 짝짓는다.
  // 한 건씩 넣으면 왕복이 그만큼 늘어나 한 번에 밀어 넣는다.
  if (data && data.length > 0) {
    const historyRows = data.map((record, i) => ({
      blacklist_id: record.id,
      action: 'registered' as const,
      reason: rows[i]?.reason ?? null,
    }));

    const { error: historyError } = await supabase
      .from('blacklist_history')
      .insert(historyRows);

    if (historyError) {
      console.error('Failed to record blacklist history:', historyError);
    }
  }

  return rows.length;
}

/**
 * 블랙리스트 이력을 기록한다.
 * 등록, 해제, 재등록 등 모든 변화를 추적한다.
 */
export async function recordBlacklistHistory(
  supabase: SupabaseClient,
  blacklistId: number,
  action: 'registered' | 'released',
  reason?: string
): Promise<void> {
  const { error } = await supabase.from('blacklist_history').insert({
    blacklist_id: blacklistId,
    action,
    reason: reason || null,
  });

  if (error) {
    console.error('Failed to record blacklist history:', error);
  }
}
