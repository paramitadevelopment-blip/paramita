import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeProductName,
  normalizePhone,
  normalizeBirth,
  normalizeOrderKey,
} from '@/lib/insurance';
import { isSamePerson, type BlacklistKey } from '@/lib/blacklist';

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
  /** 이 신청의 주문번호. 같은 신청을 두 번 세지 않는 기준이다. */
  orderNo?: string;
  /** 고객이 실제로 신청한 날(접수일자). */
  appliedAt?: Date | null;
}

/** 명단에서 읽어온 한 줄. 신청 건을 어디에 달지 정하려면 id가 필요하다. */
export interface BlacklistRecord extends BlacklistKey {
  id: number;
}

/** 명단 전체를 판정에 쓸 모양으로 읽어온다. */
export async function loadBlacklist(supabase: SupabaseClient): Promise<BlacklistRecord[]> {
  const { data, error } = await supabase
    .from('blacklist')
    .select('id, product_name, birth, tel1, tel2')
    // 해제한 사람은 빼야 한다. 이 조건이 없으면 화면에서 '해제'를 눌러도
    // 배포에서는 그대로 막혀, 오판을 되돌릴 방법이 사라진다.
    .is('released_at', null);

  if (error) {
    // 명단을 못 읽으면 이미 오른 사람이 그대로 배정된다. 조용히 넘기면
    // 영구 차단이 무너지므로 부르는 쪽에서 막을 수 있게 그대로 던진다.
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: Number(row.id),
    product: String(row.product_name ?? ''),
    birth: String(row.birth ?? ''),
    tel1: String(row.tel1 ?? ''),
    tel2: String(row.tel2 ?? ''),
  }));
}

/** 신청 한 건을 표에 넣을 모양으로. 주문번호가 없으면 셀 근거가 없어 버린다. */
function toApplicationRow(blacklistId: number, entry: BlacklistEntry) {
  const orderKey = normalizeOrderKey(entry.orderNo ?? '');
  if (!orderKey) return null;

  return {
    blacklist_id: blacklistId,
    order_key: orderKey,
    customer_name: entry.customerName || null,
    product_name: entry.product || null,
    source_file_id: entry.sourceFileId ?? null,
    source_file_name: entry.sourceFileName ?? null,
    applied_at: entry.appliedAt ? entry.appliedAt.toISOString() : null,
  };
}

/**
 * 신청 건을 남기고, 신청횟수를 그 줄 수로 맞춘다.
 *
 * 같은 파일의 같은 주문번호만 한 건으로 묶인다. 주문번호는 **파일 안에서만**
 * 유니크해서, 번호만 보고 묶으면 다른 파일에 우연히 같은 번호로 들어온 남의
 * 신청까지 한 건으로 뭉갠다. 한 파일을 두 번 배포하는 것만 막으면 된다.
 *
 * 횟수는 저장한 값을 더하는 게 아니라 **매번 다시 세서** 넣는다. 더하기만 하면
 * 한 번 어긋난 값이 영영 남는다.
 *
 * 실패해도 배포를 막지 않는다. 이번 건은 이미 차단됐고, 배포가 반쯤 되다 마는
 * 게 더 나쁘다 — 명단 등록과 같은 원칙이다.
 */
export async function recordApplications(
  supabase: SupabaseClient,
  hits: Array<{ blacklistId: number; entry: BlacklistEntry }>
): Promise<void> {
  const rows = hits
    .map(({ blacklistId, entry }) => toApplicationRow(blacklistId, entry))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('blacklist_applications')
    .upsert(rows, {
      onConflict: 'blacklist_id,source_file_id,order_key',
      ignoreDuplicates: true,
    });

  if (error) {
    console.error('Failed to record blacklist applications:', error);
    return;
  }

  await syncRequestCounts(supabase, [...new Set(rows.map((r) => r.blacklist_id))]);
}

/** 신청횟수를 신청 건수와 맞춘다. 화면의 '3회'와 출처 세 줄이 같은 값에서 나온다. */
async function syncRequestCounts(supabase: SupabaseClient, ids: number[]): Promise<void> {
  if (ids.length === 0) return;

  const { data, error } = await supabase
    .from('blacklist_applications')
    .select('blacklist_id')
    .in('blacklist_id', ids);

  if (error) {
    console.error('Failed to count blacklist applications:', error);
    return;
  }

  const counts = new Map<number, number>();
  for (const row of data ?? []) {
    const id = Number(row.blacklist_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  await Promise.all(
    ids.map(async (id) => {
      const count = counts.get(id) ?? 0;
      const { error: updateError } = await supabase
        .from('blacklist')
        .update({ request_count: count, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (updateError) console.error('Failed to sync request_count:', updateError);
    })
  );
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

  /*
   * 같은 사람을 한 줄로 묶는다.
   *
   * 묶는 기준은 판정과 같아야 한다 — **상품 + 전화번호 겹침**(isSamePerson).
   * 예전에는 여기서만 생년월일까지 묶음에 넣었는데, 판정은 생년월일을 안 본다.
   * 그래서 번호를 공유하는 한 사람이 생년월일이 다르다는 이유로 명단에 두 줄로
   * 올라갔고, 그 뒤로는 신청 건이 두 줄에 나뉘어 붙어 횟수가 양쪽에 중복됐다.
   *
   * 문자열 키로 묶을 수 없다. Tel1·Tel2 중 하나만 겹쳐도 같은 사람이라
   * ['010-1','010-2']와 ['010-1']은 키가 달라도 한 사람이다. 겹침을 직접 본다.
   */
  const groups: Array<{ key: BlacklistKey; row: any; entries: BlacklistEntry[] }> = [];

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

    const key: BlacklistKey = {
      product: entry.product,
      birth: entry.birth,
      tel1: entry.tel1,
      tel2: entry.tel2,
    };

    // 이미 모아 둔 사람인가. 맞으면 줄은 그대로 두고 신청만 붙인다.
    const existing = groups.find((g) => isSamePerson(key, g.key));
    if (existing) {
      existing.entries.push(entry);
      // 번호가 한쪽에만 있으면 명단 줄이 그 번호를 놓친다. 본 번호를 다 담아야
      // 다음 배포에서 어느 칸에 넣어 오든 걸린다.
      const merged = new Set<string>([...existing.row.phone_keys, ...phoneKeys]);
      existing.row.phone_keys = [...merged];
      continue;
    }

    groups.push({
      key,
      entries: [entry],
      row: {
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
      },
    });
  }

  const rows = groups.map((g) => g.row);
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

    // 이 사람이 몇 번 신청해서 걸렸는지를 건별로 남긴다. 여기서 남기지 않으면
    // 나중에 또 걸렸을 때 더할 밑바탕이 없어 횟수가 1부터 다시 센 것처럼 보인다.
    await recordApplications(
      supabase,
      data.flatMap((record, i) =>
        (groups[i]?.entries ?? []).map((entry) => ({
          blacklistId: Number(record.id),
          entry,
        }))
      )
    );
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
