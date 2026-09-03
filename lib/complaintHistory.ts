import type { SupabaseClient } from '@supabase/supabase-js';
import { ASSIGNED_DEPT_COLUMN, ASSIGNED_AT_COLUMN } from '@/lib/insurance';
import { parseDateCell } from '@/lib/parseDateCell';
import type { MatchRecord } from '@/lib/complaintMatch';

/**
 * 민원의 주인을 찾는 데 쓸 과거 배포 기록을 읽는다.
 *
 * 중복 판정(lib/historyLookup.ts의 loadRecentKeys)과 목적이 다르다.
 *   - 중복은 최근 30·60일만 본다. 그보다 오래된 건 다시 신청해도 되는 건이다.
 *   - 민원은 몇 달 전에 배정된 고객도 들어온다. 기간으로 자르면 그 사람의
 *     지사를 못 찾아 전부 관리자에게 쌓인다.
 *
 * 그래서 기간 대신 **찾는 값으로** 자른다. 주문번호나 이름이 그 안에 들어 있는
 * 파일만 골라 읽으면, 30일치를 통째로 퍼 올리는 것보다 오히려 적게 읽는다.
 * (Postgres의 jsonb 포함 연산 @> — supabase-js에서는 .contains)
 *
 * 원본 파일만 본다. 배포본은 원본을 소속별로 쪼갠 사본이라 같은 사람이 여러 번
 * 나오고, source='file_transfer'는 아직 분류·배포되지 않은 대기열이라
 * 배정소속이 비어 있다 — 둘 다 "어느 지사가 받았나"의 답이 될 수 없다.
 */

/** file_content 한 줄에서 이 판정에 쓰는 값만 뽑는다. */
function toMatchRecord(
  row: Record<string, unknown>,
  file: { id: string; name: string; uploaded_at: string }
): MatchRecord {
  return {
    uploadedAt: new Date(file.uploaded_at),
    fileId: String(file.id ?? ''),
    fileName: String(file.name ?? ''),
    assignedTo: String(row[ASSIGNED_DEPT_COLUMN] ?? ''),
    assignedAt: parseDateCell(row[ASSIGNED_AT_COLUMN]),
    receivedAt: parseDateCell(row['접수일자']),
    name: String(row['고객명'] ?? ''),
    tel1: String(row['Tel1'] ?? ''),
    tel2: String(row['Tel2'] ?? ''),
    orderNo: String(row['주문번호'] ?? ''),
  };
}

async function rowsContaining(
  supabase: SupabaseClient,
  needle: Record<string, string>
): Promise<MatchRecord[]> {
  /*
   * JSON 문자열로 넘긴다.
   *
   * .contains()에 배열을 그대로 주면 supabase-js가 Postgres 배열 리터럴
   * '{...}'로 바꿔 보내는데, jsonb 열은 그 형식을 못 읽는다
   * (invalid input syntax for type json). 문자열은 손대지 않고 그대로
   * 보내므로 '[{"주문번호":"..."}]' 형태가 유지된다.
   */
  const { data, error } = await supabase
    .from('files')
    .select('id, name, uploaded_at, file_content')
    .eq('is_original', true)
    .eq('source', 'direct')
    .contains('file_content', JSON.stringify([needle]));

  if (error) {
    // 과거를 못 읽으면 "기록에 없는 고객"과 구별이 안 된다. 조용히 넘어가면
    // 있는 고객을 관리자에게 떠넘기게 되므로 그대로 던진다.
    throw error;
  }

  const [key, value] = Object.entries(needle)[0];
  const records: MatchRecord[] = [];

  for (const file of data ?? []) {
    if (!Array.isArray(file.file_content)) continue;
    for (const row of file.file_content) {
      if (!row || typeof row !== 'object') continue;
      // 포함 검사는 파일 단위다. 그 파일의 다른 사람 줄까지 딸려 오므로 여기서 좁힌다.
      if (String((row as any)[key] ?? '') !== value) continue;
      records.push(toMatchRecord(row as Record<string, unknown>, file as any));
    }
  }

  return records;
}

/**
 * 주문번호와 이름으로 후보를 모아 온다.
 *
 * 둘을 따로 읽는 이유: 주문번호가 같으면 이름이 달라도 같은 신청 건이고,
 * 주문번호가 비어 있으면 이름으로만 찾아야 한다. 한 번에 거르면 둘 중 하나가
 * 빈 경우를 놓친다. 판정 순서는 lib/complaintMatch.ts가 정한다.
 */
export async function loadComplaintCandidates(
  supabase: SupabaseClient,
  target: { orderNo: string; name: string }
): Promise<MatchRecord[]> {
  const orderNo = target.orderNo.trim();
  const name = target.name.trim();

  const [byOrder, byName] = await Promise.all([
    orderNo ? rowsContaining(supabase, { 주문번호: orderNo }) : Promise.resolve([]),
    name ? rowsContaining(supabase, { 고객명: name }) : Promise.resolve([]),
  ]);

  return [...byOrder, ...byName];
}
