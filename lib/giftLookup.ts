import type { SupabaseClient } from '@supabase/supabase-js';
import { ASSIGNED_DEPT_COLUMN } from '@/lib/insurance';
import { isAssignedRecord } from '@/lib/lastAssignment';

/**
 * 주문번호로 배포 기록 한 줄을 찾는다.
 *
 * 사은품 신청은 주문번호 하나로 시작한다. 그 번호로 우리가 실제로 지사에
 * 배정한 줄을 찾아, 거기 적힌 고객명·전화번호·주소를 신청서에 그대로 옮긴다.
 *
 * 민원의 고객 찾기(lib/complaintHistory.ts)와 같은 곳(원본 파일의 file_content)을
 * 보지만, 돌려주는 것이 다르다 — 민원은 "어느 지사였나"만 필요해서 판정용 값만
 * 뽑고, 사은품은 신청서를 채워야 해서 **줄 전체**가 필요하다.
 *
 * 못 찾으면 null이다. 이때 신청을 받지 않는다 — 우리가 배포하지 않은 고객에게
 * 사은품이 나가면 누가 왜 보냈는지 되짚을 길이 없다.
 */
export interface GiftSourceRecord {
  row: Record<string, unknown>;
  fileId: string;
  fileName: string;
  uploadedAt: Date;
  /** 그 줄이 배정된 소속(departments.name). '중복 제외'·블랙리스트는 걸러져 있다. */
  assignedDept: string;
}

export async function findGiftSource(
  supabase: SupabaseClient,
  orderNo: string
): Promise<GiftSourceRecord | null> {
  const needle = orderNo.trim();
  if (!needle) return null;

  /*
   * JSON 문자열로 넘긴다. 배열을 그대로 주면 supabase-js가 Postgres 배열
   * 리터럴로 바꿔 jsonb가 거부한다(lib/complaintHistory.ts와 같은 사정).
   */
  const { data, error } = await supabase
    .from('files')
    .select('id, name, uploaded_at, file_content')
    .eq('is_original', true)
    .eq('source', 'direct')
    .contains('file_content', JSON.stringify([{ 주문번호: needle }]));

  if (error) throw error;

  let best: GiftSourceRecord | null = null;
  for (const file of data ?? []) {
    if (!Array.isArray(file.file_content)) continue;
    for (const row of file.file_content) {
      if (!row || typeof row !== 'object') continue;
      const record = row as Record<string, unknown>;
      // 포함 검사는 파일 단위다. 그 파일의 다른 줄까지 딸려 오므로 여기서 좁힌다.
      if (String(record['주문번호'] ?? '').trim() !== needle) continue;

      const assignedDept = String(record[ASSIGNED_DEPT_COLUMN] ?? '').trim();
      // 같은 주문번호가 두 줄이면 하나는 '중복 제외'다. 실제로 배정된 쪽만 본다.
      if (!isAssignedRecord({ assignedTo: assignedDept } as any)) continue;

      const uploadedAt = new Date(file.uploaded_at);
      // 같은 번호가 여러 파일에 있으면 나중에 처리된 것을 쓴다.
      if (!best || uploadedAt > best.uploadedAt) {
        best = {
          row: record,
          fileId: String(file.id),
          fileName: String(file.name ?? ''),
          uploadedAt,
          assignedDept,
        };
      }
    }
  }
  return best;
}

/**
 * 배정된 소속(departments.name)이 어느 조직(group_name)인지.
 *
 * 파라인슈1·파라인슈2는 둘 다 '파라인슈' 조직이다. 설계사의 소속은 조직명이라,
 * 그 고객이 우리 지사 것인지 보려면 이 단계가 필요하다.
 */
export async function groupOfDepartment(
  supabase: SupabaseClient,
  departmentName: string
): Promise<string | null> {
  if (!departmentName) return null;
  const { data } = await supabase
    .from('departments')
    .select('group_name')
    .eq('name', departmentName)
    .maybeSingle();
  return data?.group_name ?? null;
}
