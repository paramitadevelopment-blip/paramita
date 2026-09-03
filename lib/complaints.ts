/**
 * 민원 한 건이 들고 다니는 값과, 그 값을 읽고 쓰는 규칙.
 *
 * 화면과 API가 같은 정의를 봐야 한다 — 상태 이름이나 열 목록이 갈리면
 * "화면에는 처리 완료인데 목록에는 안 뜬다" 같은 어긋남이 생긴다.
 */

/** 목록·상세에 내려보내는 열. 내부용 id(created_by_id·agent_id는 화면이 쓴다)만 빼고 그대로다. */
export const COMPLAINT_COLUMNS =
  'id, product, customer_name, phone, order_no, received_at, order_confirmed_at, ' +
  'called_at, call_memo, ' +
  'assigned_group, assign_type, assigned_by, assigned_at, match_key, ' +
  'source_file_id, source_file_name, previous_applied_at, ' +
  'agent_id, agent_name, agent_assign_type, agent_assigned_by, agent_assigned_at, ' +
  'status, handled_note, handled_by, handled_at, ' +
  'return_reason, returned_by, returned_at, ' +
  'created_by, created_at';

/**
 * 민원 한 건이 거치는 자리.
 *
 * 'unassigned'는 "아직 아무도 안 봤다"가 아니라 **담당 지사를 못 찾았다**는
 * 뜻이다. 그 건은 지사가 아니라 관리자에게 쌓인다.
 */
export const COMPLAINT_STATUSES = ['unassigned', 'branch', 'agent', 'done', 'returned'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = {
  unassigned: '담당 지사 없음',
  branch: '지사 확인 대기',
  agent: '설계사 처리 대기',
  done: '처리 완료',
  returned: '반려',
};

/** 어떻게 배정됐는지. 지금 설계사 배정은 전부 manual이지만 자리는 나눠 둔다. */
export type AssignType = 'auto' | 'manual';

export const ASSIGN_TYPE_LABEL: Record<AssignType, string> = {
  auto: '자동배정',
  manual: '수동배정',
};

/** 무엇으로 고객을 찾았는지. 왜 이 지사로 갔나를 되짚는 근거다. */
export const MATCH_KEY_LABEL: Record<string, string> = {
  order_no: '주문번호',
  name_phone: '이름·전화번호',
};

export interface ComplaintRow {
  id: number;
  product: string | null;
  customer_name: string;
  phone: string | null;
  order_no: string | null;
  received_at: string | null;
  order_confirmed_at: string | null;
  called_at: string | null;
  call_memo: string | null;
  assigned_group: string | null;
  assign_type: AssignType | null;
  assigned_by: string | null;
  assigned_at: string | null;
  match_key: string | null;
  source_file_id: string | null;
  source_file_name: string | null;
  previous_applied_at: string | null;
  agent_id: number | null;
  agent_name: string | null;
  agent_assign_type: AssignType | null;
  agent_assigned_by: string | null;
  agent_assigned_at: string | null;
  status: ComplaintStatus;
  handled_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  return_reason: string | null;
  returned_by: string | null;
  returned_at: string | null;
  created_by: string;
  created_at: string;
}

/**
 * 넣은 사람이 아직 고치거나 지울 수 있는 건인가.
 *
 * 옮겨 적다 한 글자 틀리는 일은 늘 있고, 그때는 넣은 사람이 바로 고치는 게
 * 맞다. 다만 **다른 사람이 이미 손을 댄 뒤에는 안 된다** — 지사가 설계사를
 * 정했거나, 관리자가 지사를 지정했거나 반려한 뒤에 내용이 바뀌면, 그 사람들이
 * 판단한 근거와 지금 적힌 내용이 달라진다. 처리까지 끝난 건이 사라지면
 * 처리 기록도 함께 사라진다.
 *
 * 그래서 "아무도 손대지 않은 상태"만 연다:
 *   - 담당 지사를 못 찾아 관리자 앞에 놓인 건(unassigned) — 아직 아무도 안 봤다
 *   - 자동으로 지사까지만 간 건(branch + auto) — 지사가 아직 아무것도 안 했다
 *
 * 반려된 건은 잠긴다. 관리자가 사유를 적어 되돌린 것 자체가 기록이라,
 * 고쳐 넣어야 한다면 새로 접수한다.
 */
export function isUntouchedComplaint(row: {
  status: ComplaintStatus;
  assign_type: AssignType | null;
  agent_id: number | null;
  handled_at: string | null;
}): boolean {
  if (row.agent_id || row.handled_at) return false;
  if (row.status === 'unassigned') return true;
  return row.status === 'branch' && row.assign_type !== 'manual';
}

/**
 * 화면에서 온 날짜 문자열을 Date로.
 *
 * 'YYYY-MM-DD'를 new Date()에 그냥 넣으면 UTC 자정으로 읽힌다. 한국에서는
 * 그게 전날 09시라, 다시 날짜만 잘라내면 하루가 밀린다. 날짜만 있는 값은
 * 그 날의 현지 자정으로 만든다.
 */
export function parseDateInput(value: unknown): Date | null {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  // 'YYYY-MM-DD HH:mm' — 브라우저가 공백 구분을 다르게 읽을 수 있어 T로 맞춘다.
  const parsed = new Date(text.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * date 열에 넣을 'YYYY-MM-DD'.
 *
 * toISOString()을 쓰면 UTC로 옮겨져 한국 시간 자정이 전날이 된다.
 */
export function toDateOnly(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
