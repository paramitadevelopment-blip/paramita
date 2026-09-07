import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/insurance';
import { matchComplaint } from '@/lib/complaintMatch';
import { loadComplaintCandidates } from '@/lib/complaintHistory';
import {
  THREAD_MATCH_KEY,
  complaintThreadKey,
  parseDateInput,
  toDateOnly,
  validateComplaintInput,
} from '@/lib/complaints';

/**
 * 민원을 받아 적고 담당 지사를 찾는 부분.
 *
 * 새로 넣을 때와 넣은 사람이 고칠 때가 똑같아야 한다 — 고치는 쪽에서 매칭을
 * 다시 안 돌리면, 주문번호를 잘못 적어 '담당 지사 없음'이 된 건을 고쳐도
 * 여전히 관리자 앞에 남는다. 반대로 검사만 한쪽에 있으면 고칠 때는 빈 이름도
 * 들어간다. 그래서 두 라우트가 이 파일을 같이 본다.
 */

export interface ComplaintFields {
  product: string;
  customerName: string;
  phone: string;
  orderNo: string;
  receivedAt: Date | null;
  orderConfirmedAt: Date | null;
  calledAt: Date | null;
  callMemo: string;
}

export type ReadResult =
  | { ok: true; fields: ComplaintFields }
  | { ok: false; error: string };

/**
 * 요청 본문에서 값을 읽고 검사한다.
 *
 * 화면에서 막았더라도 여기서 다시 본다 — 요청은 화면을 거치지 않고도 만들 수
 * 있다. 검사 자체는 화면과 같은 함수(validateComplaintInput)를 쓴다.
 */
export function readComplaintInput(body: Record<string, unknown>): ReadResult {
  const error = validateComplaintInput(body);
  if (error) return { ok: false, error };

  const fields: ComplaintFields = {
    product: String(body.product ?? '').trim(),
    customerName: String(body.customerName ?? '').trim(),
    phone: String(body.phone ?? '').trim(),
    orderNo: String(body.orderNo ?? '').trim(),
    receivedAt: parseDateInput(body.receivedAt),
    orderConfirmedAt: parseDateInput(body.orderConfirmedAt),
    calledAt: parseDateInput(body.calledAt),
    callMemo: String(body.callMemo ?? '').trim(),
  };

  return { ok: true, fields };
}

/**
 * 담당 지사를 찾아 그 결과까지 담은, 표에 그대로 넣을 값.
 *
 * 못 찾으면 배정 자리를 전부 비우고 'unassigned'로 둔다. 고칠 때 이 값들을
 * 통째로 덮어써야 한다 — 예전에 찾았던 지사를 그대로 두면, 이름을 바꿔
 * 다른 사람이 됐는데도 옛 지사에 그대로 남는다.
 */
export async function toComplaintRow(
  supabase: SupabaseClient,
  fields: ComplaintFields
): Promise<Record<string, unknown>> {
  // 같은 건의 반복 민원을 묶는 열쇠. 아래 '앞 건이 간 지사'를 찾을 때도 쓴다.
  const threadKey = complaintThreadKey(fields.orderNo, fields.phone);

  const candidates = await loadComplaintCandidates(supabase, {
    orderNo: fields.orderNo,
    name: fields.customerName,
  });
  const match = matchComplaint(
    {
      orderNo: fields.orderNo,
      name: fields.customerName,
      phone: fields.phone,
      receivedAt: fields.receivedAt,
    },
    candidates
  );

  /*
   * 배정 결과는 분류명('파라인슈1')이지만 사람은 조직('파라인슈')에 속한다.
   * 조직으로 바꿔 두지 않으면 그 지사 계정이 자기 민원을 못 본다.
   */
  let assignedGroup: string | null = null;
  if (match) {
    const { data: dept } = await supabase
      .from('departments')
      .select('group_name')
      .eq('name', match.dept)
      .maybeSingle();
    assignedGroup = dept?.group_name ?? null;
  }

  /*
   * 같은 건의 2차 민원은 앞과 같은 지사로 보낸다.
   *
   * 배포 기록을 매번 새로 뒤지면, 그 사이 기록이 늘거나 바뀌어 다른 지사가
   * 나올 수 있다. 같은 주문에 대한 민원이 지사마다 흩어지면 받은 쪽은 앞의
   * 사정을 모른 채 처음부터 다시 파악해야 한다. 앞 건이 간 곳이 있으면
   * 그곳이 맞다.
   */
  const { data: previous } = await supabase
    .from('complaints')
    .select('assigned_group')
    .eq('thread_key', threadKey)
    .not('assigned_group', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  /*
   * 물려받은 경우에는 매칭 근거가 없다.
   *
   * 배포 기록에서 찾은 게 아니라 앞 민원을 따라간 것이므로, '찾은 방법'과
   * 근거 파일·직전 신청일은 이번 건의 근거가 아니다. 앞 건의 근거를 그대로
   * 베껴 놓으면 되짚을 때 이번 건이 스스로 찾아진 것처럼 보인다.
   */
  const inherited = !!previous?.assigned_group && previous.assigned_group !== assignedGroup;
  if (previous?.assigned_group) {
    assignedGroup = previous.assigned_group;
  }
  const foundHere = !!assignedGroup && !!match && !inherited;

  const now = new Date().toISOString();
  const phoneKey = normalizePhone(fields.phone);

  return {
    product: fields.product || null,
    customer_name: fields.customerName,
    phone: fields.phone || null,
    phone_keys: phoneKey ? [phoneKey] : [],
    order_no: fields.orderNo || null,
    received_at: fields.receivedAt ? toDateOnly(fields.receivedAt) : null,
    order_confirmed_at: fields.orderConfirmedAt ? toDateOnly(fields.orderConfirmedAt) : null,
    called_at: fields.calledAt ? fields.calledAt.toISOString() : null,
    call_memo: fields.callMemo || null,
    thread_key: threadKey,

    assigned_group: assignedGroup,
    assign_type: assignedGroup ? 'auto' : null,
    assigned_at: assignedGroup ? now : null,
    // 배포 기록에서 찾은 것과, 앞 민원을 따라간 것을 구별해 적는다.
    match_key: foundHere ? match!.matchKey : assignedGroup ? THREAD_MATCH_KEY : null,
    source_file_id: foundHere ? match!.fileId : null,
    source_file_name: foundHere ? match!.fileName : null,
    previous_applied_at: foundHere ? match!.at.toISOString() : null,
    previous_assigned_at: foundHere ? (match!.assignedAt?.toISOString() ?? null) : null,
    status: assignedGroup ? 'branch' : 'unassigned',
  };
}
