import type { SupabaseClient } from '@supabase/supabase-js';
import {
  HISTORY_DUP_DAYS,
  BLACKLIST_DAYS,
  DUPLICATE_REASON_COLUMN,
  DUP_ORDER_REASON,
  ASSIGNED_DEPT_COLUMN,
  ASSIGNED_AT_COLUMN,
} from '@/lib/insurance';
import { parseDateCell } from '@/lib/parseDateCell';
import type { DedupeKey } from '@/lib/historyDedupe';
import type { BlacklistKey } from '@/lib/blacklist';

/** 과거 기록 한 줄. 언제 올라온 건지 함께 들고 있어야 기간별로 자를 수 있다. */
export interface PastRecord extends DedupeKey {
  uploadedAt: Date;
  product: string;
  /** 이 행이 중복으로 빠졌다면 그 사유. 배정된 행은 빈 문자열이다. */
  dupReason: string;
  /**
   * 배정소속 열. '파라인슈1' 같은 지사이거나 '중복 제외'·'블랙리스트'다.
   * 재신청 알림에서 "직전에 어느 지사가 받았나"를 찾는 데 쓴다.
   */
  assignedTo: string;
  /** 어느 파일의 행이었나. 알림에서 그 파일을 열어볼 수 있게 남긴다. */
  fileId: string;
  fileName: string;
  /**
   * 실제로 지사에 배정된 시각(배정날짜 열). 파일 업로드 시각이 아니다 —
   * 같은 파일을 두 번 올리면 업로드 시각은 두 개인데 배정은 한 번이다.
   * 읽을 수 없으면 null.
   */
  assignedAt: Date | null;
  /** 고객이 실제로 신청한 날(접수일자 열). 우리가 처리한 날이 아니다. */
  receivedAt: Date | null;
  /**
   * 그때의 주문번호.
   *
   * 블랙리스트에 올릴 때 "몇 번 신청해서 걸렸나"를 건별로 남기는데,
   * 같은 신청을 두 번 세지 않으려면 이 값이 있어야 한다.
   */
  orderNo: string;
}

/** 최근 며칠치만 남긴다. */
export function withinDays(records: PastRecord[], now: Date, days: number): PastRecord[] {
  const since = historyWindowStart(now, days);
  return records.filter((r) => r.uploadedAt >= since);
}

/** 중복 판정에 쓸 모양 */
export function toDedupeKeys(records: PastRecord[]): DedupeKey[] {
  return records;
}

/**
 * 블랙리스트 카운트에 쓸 모양.
 *
 * 원천 내역을 그대로 센다 — 중복으로 빠졌든 배정됐든 신청은 있었던 일이다.
 * 다만 '주문번호 중복'만 뺀다. 같은 주문번호는 엑셀에 같은 줄이 두 번 들어간
 * 것이지 두 번 신청한 게 아니다.
 */
export function toBlacklistKeys(records: PastRecord[]): BlacklistKey[] {
  return records
    .filter((r) => r.dupReason !== DUP_ORDER_REASON)
    .map((r) => ({ product: r.product, birth: r.birth, tel1: r.tel1, tel2: r.tel2 }));
}

/** 블랙리스트 판정에 쓴 것과 같은 건들. 어느 파일의 어느 주문이었는지까지 들고 있다 */
export type BlacklistSource = BlacklistKey &
  Pick<PastRecord, 'name' | 'orderNo' | 'fileId' | 'fileName' | 'receivedAt'>;

/**
 * 명단에 올릴 때 "몇 번 신청해서 걸렸나"를 건별로 남기는 데 쓴다.
 *
 * toBlacklistKeys와 같은 것을 세지만 출처를 버리지 않는다 —
 * 횟수만 남기면 화면에 3회라고 떠 있어도 어디서 왔는지 짚을 수가 없다.
 */
export function toBlacklistSources(records: PastRecord[]): BlacklistSource[] {
  return records
    .filter((r) => r.dupReason !== DUP_ORDER_REASON)
    .map((r) => ({
      product: r.product,
      birth: r.birth,
      tel1: r.tel1,
      tel2: r.tel2,
      name: r.name,
      orderNo: r.orderNo,
      fileId: r.fileId,
      fileName: r.fileName,
      receivedAt: r.receivedAt,
    }));
}

/**
 * 과거를 어디까지 거슬러 볼지. D-30 날짜의 0시다.
 *
 * "30일 × 24시간 전"으로 재면 같은 날에 올린 건인데도 시각에 따라 갈린다.
 *   7/26 09시에 올린 건 → 제외
 *   7/26 11시에 올린 건 → 포함   (8/25 10시에 배포한 경우)
 * 그러면 오늘 몇 시에 배포하느냐로 결과가 달라져, 같은 파일을 아침에 올릴 때와
 * 오후에 올릴 때 중복 건수가 어긋난다. 날짜 단위로 잘라 그 흔들림을 없앤다.
 */
export function historyWindowStart(now: Date, days = HISTORY_DUP_DAYS): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - days);
  return start;
}

/**
 * 지난 30일치 업로드에서 중복 판정에 쓸 값만 뽑아 온다.
 *
 * 원본 파일만 본다. 배포본은 원본을 소속별로 쪼갠 사본이라 같은 사람이
 * 여러 번 세어질 뿐이고, 원본에는 중복으로 빠진 행까지 들어 있어 더 넓게 잡는다.
 *
 * source='file_transfer'는 뺀다. 그건 DB담당자가 올려놓고 관리자가 아직
 * 분류·배포하지 않은 대기열이라 배정소속·중복사유가 비어 있다 — 실제로
 * 처리된 적 없는 신청을 "이미 처리됨"으로 잘못 세게 된다. 더 심각한 건,
 * 관리자가 그 파일을 내려받아 파일업로드 화면에 그대로 다시 올리면 이 대기열
 * 행이 자기 자신과 완전히 같은 내용이라 전부 중복으로 걸린다. 파일전달과
 * 파일업로드는 서로 다른 화면이므로 이 이력 조회에서도 겹치면 안 된다.
 *
 * file_content는 파일당 수백 kB다. 30일치를 통째로 올리면 무겁지만, 비교에 쓰는
 * 네 값만 남기고 바로 버리므로 메모리에 남는 건 행 수에 비례하는 작은 배열이다.
 */
export async function loadRecentKeys(
  supabase: SupabaseClient,
  now: Date,
  /** 이번에 올린 파일들. 자기 자신과 비교하면 전부 중복이 된다 */
  excludeFileIds: string[] = []
): Promise<PastRecord[]> {
  // 중복(30일)과 블랙리스트(60일)가 같은 파일을 본다. 한 번에 긴 쪽을 읽어
  // 부르는 쪽에서 잘라 쓴다 — 따로 두 번 읽으면 같은 것을 두 번 퍼 올린다.
  const since = historyWindowStart(now, Math.max(HISTORY_DUP_DAYS, BLACKLIST_DAYS));

  let query = supabase
    .from('files')
    .select('id, name, uploaded_at, file_content')
    .eq('is_original', true)
    .eq('source', 'direct')
    .gte('uploaded_at', since.toISOString());

  const { data, error } = await query;

  if (error) {
    // 과거를 못 읽으면 중복을 못 거른다. 조용히 넘어가면 같은 고객에게 두 번
    // 연락이 가므로, 부르는 쪽에서 배포를 막을 수 있게 그대로 던진다.
    throw error;
  }

  const exclude = new Set(excludeFileIds);
  const keys: PastRecord[] = [];

  for (const file of data ?? []) {
    if (exclude.has(file.id)) continue;
    if (!Array.isArray(file.file_content)) continue;

    const uploadedAt = new Date(file.uploaded_at);

    for (const row of file.file_content) {
      if (!row || typeof row !== 'object') continue;
      keys.push({
        uploadedAt,
        fileId: String(file.id ?? ''),
        fileName: String(file.name ?? ''),
        assignedTo: String((row as any)[ASSIGNED_DEPT_COLUMN] ?? ''),
        assignedAt: parseDateCell((row as any)[ASSIGNED_AT_COLUMN]),
        receivedAt: parseDateCell((row as any)['접수일자']),
        dupReason: String((row as any)[DUPLICATE_REASON_COLUMN] ?? ''),
        name: String((row as any)['고객명'] ?? ''),
        tel1: String((row as any)['Tel1'] ?? ''),
        tel2: String((row as any)['Tel2'] ?? ''),
        birth: String((row as any)['생년월일성별'] ?? ''),
        product: String((row as any)['상품명'] ?? ''),
        orderNo: String((row as any)['주문번호'] ?? ''),
      });
    }
  }

  return keys;
}
