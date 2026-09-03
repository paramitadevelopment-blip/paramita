import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone } from '@/lib/insurance';
import { matchComplaint } from '@/lib/complaintMatch';
import { loadComplaintCandidates } from '@/lib/complaintHistory';
import { parseDateInput, toDateOnly } from '@/lib/complaints';

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

/** 요청 본문에서 값을 읽고 검사한다. 화면에서 막았더라도 여기서 다시 본다. */
export function readComplaintInput(body: Record<string, unknown>): ReadResult {
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

  if (!fields.customerName) {
    return { ok: false, error: '수령인 이름을 입력해 주세요.' };
  }
  /*
   * 주문번호도 전화번호도 없으면 고객을 찾을 방법이 아예 없다. 이름만으로
   * 찾으면 동명이인에게 남의 민원이 간다 — 그래서 저장 자체를 막는다.
   */
  if (!fields.orderNo && !fields.phone) {
    return {
      ok: false,
      error: '주문번호나 전화번호 중 하나는 있어야 고객을 찾을 수 있습니다.',
    };
  }
  if (fields.customerName.length > 50 || fields.phone.length > 30 || fields.orderNo.length > 50) {
    return { ok: false, error: '입력값이 너무 깁니다.' };
  }
  if (fields.callMemo.length > 2000 || fields.product.length > 200) {
    return { ok: false, error: '입력값이 너무 깁니다.' };
  }

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

    assigned_group: assignedGroup,
    assign_type: assignedGroup ? 'auto' : null,
    assigned_at: assignedGroup ? now : null,
    match_key: assignedGroup ? match!.matchKey : null,
    source_file_id: assignedGroup ? match!.fileId : null,
    source_file_name: assignedGroup ? match!.fileName : null,
    previous_applied_at: assignedGroup ? match!.at.toISOString() : null,
    status: assignedGroup ? 'branch' : 'unassigned',
  };
}
