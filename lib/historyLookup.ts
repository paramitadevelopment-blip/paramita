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
      });
    }
  }

  return keys;
}
