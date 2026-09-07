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
  'source_file_id, source_file_name, previous_applied_at, previous_assigned_at, ' +
  'agent_id, agent_name, agent_assign_type, agent_assigned_by, agent_assigned_at, ' +
  'status, handled_note, handled_by, handled_at, ' +
  'read_at, read_by, ' +
  'return_reason, returned_by, returned_at, ' +
  'thread_key, sequence_no, ' +
  'created_by, created_at, ' +
  // 지나간 반려까지 함께 읽는다. 몇 번 오갔는지가 그 건의 사정이다.
  'complaint_returns(reason, returned_by, returned_at)';

/**
 * 민원 한 건이 거치는 자리.
 *
 * 'unassigned'는 "아직 아무도 안 봤다"가 아니라 **담당 지사를 못 찾았다**는
 * 뜻이다. 그 건은 지사가 아니라 관리자에게 쌓인다.
 */
/**
 * 목록에서만 쓰는 '미처리'.
 *
 * 실제 상태가 아니라 '지사에 와 있는 것(branch) + 설계사에게 넘긴 것(agent)'
 * 묶음이다. 단계는 달라도 둘 다 아직 안 끝난 것이라, 지사가 자기 할 일을 볼
 * 때는 한 덩어리로 본다. 사이드바 배지가 세는 범위와 같다.
 */
export const PENDING_STATUS = 'pending';

/** 목록을 거를 때 고를 수 있는 값. 빈 문자열은 전체. */
export type ComplaintFilter = ComplaintStatus | typeof PENDING_STATUS | '';

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
  thread: '같은 건의 앞 민원',
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
  /** 직전 건을 고객이 신청한 날 */
  previous_applied_at: string | null;
  /** 그 건이 실제로 지사에 배정된 날. 배정날짜 열을 못 읽었으면 null. */
  previous_assigned_at: string | null;
  agent_id: number | null;
  agent_name: string | null;
  agent_assign_type: AssignType | null;
  agent_assigned_by: string | null;
  agent_assigned_at: string | null;
  status: ComplaintStatus;
  handled_note: string | null;
  handled_by: string | null;
  handled_at: string | null;
  /** 지사·설계사가 이 민원을 열어 본 시각. 안 봤으면 null이다. */
  read_at: string | null;
  read_by: string | null;
  return_reason: string | null;
  returned_by: string | null;
  returned_at: string | null;
  /** 같은 건의 반복 민원을 묶는 열쇠. 주문번호 + 전화번호(숫자만). */
  thread_key: string | null;
  /** 그 묶음에서 몇 번째인가. 1이면 처음 들어온 건이다. */
  sequence_no: number;
  /** 그 묶음의 총 건수. 서버가 목록을 만들 때 얹어 준다(DB 열이 아니다). */
  thread_total?: number;
  /** 그 묶음에 아직 안 끝난 건이 있는가. 목록에서 붉게 칠할지를 여기서 정한다. */
  thread_open?: boolean;
  created_by: string;
  created_at: string;
  /** 지나간 반려들. 시간 순이 아닐 수 있어 화면에서 정렬해 쓴다. */
  complaint_returns?: Array<{ reason: string; returned_by: string; returned_at: string }>;
}

/**
 * 접수한 지 며칠 지났는가. 접수 당일은 0일이다.
 *
 * 시각이 아니라 날짜로 센다 — 아침에 보면 2일, 저녁에 보면 3일처럼
 * 보는 시각에 따라 숫자가 달라지면 "3일 넘은 건"의 기준이 흔들린다.
 */
export function daysSince(iso: string | null, now: Date = new Date()): number {
  if (!iso) return 0;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const passed = (day(now) - day(new Date(iso))) / 86400000;
  return passed > 0 ? Math.floor(passed) : 0;
}

/** 며칠부터 '밀린 건'으로 볼 것인가. */
export const COMPLAINT_OVERDUE_DAYS = 3;

/**
 * 밀린 건인가.
 *
 * 처리가 끝났거나 반려된 건은 아무리 오래돼도 밀린 것이 아니다 — 할 일이
 * 남아 있는 건만 센다. 그래야 목록에서 색이 붙은 줄이 곧 '지금 손봐야 할 것'이 된다.
 */
export function isOverdueComplaint(
  row: { status: ComplaintStatus; created_at: string },
  now: Date = new Date()
): boolean {
  if (row.status === 'done' || row.status === 'returned') return false;
  return daysSince(row.created_at, now) >= COMPLAINT_OVERDUE_DAYS;
}

/**
 * 접수 입력 검사.
 *
 * 화면과 서버가 같은 함수를 본다 — 따로 적으면 "화면은 넘어갔는데 서버가
 * 막는다"가 생기고, 그때 사람은 무엇이 잘못됐는지 알 수 없다.
 *
 * 여덟 칸이 다 있어야 한다. 메일에 오는 표의 칸이 그대로 여덟이라, 하나라도
 * 비면 옮겨 적다 건너뛴 것이다. 받는 지사·설계사는 그 빈칸을 채울 방법이
 * 없다 — 원본은 메일에만 있다.
 *
 * @returns 잘못된 것이 있으면 그 이유, 없으면 null
 */
/**
 * 같은 건의 반복 민원을 묶는 열쇠.
 *
 * **변하지 않는 것만 쓴다.** 주문번호는 그 주문 한 건의 고유번호이고 전화번호는
 * 그 고객이다. 상품명·통화내역·원하는 내용은 통화할 때마다 달라지므로 열쇠에
 * 넣으면 같은 건이 매번 다른 건으로 갈린다.
 *
 * 전화번호는 숫자만 남긴다 — 같은 번호를 '010-1111-2222'로도 '01011112222'로도
 * 적기 때문이다.
 */
/**
 * 배포 기록이 아니라 '같은 건의 앞 민원'을 따라 배정됐다는 표시.
 *
 * 찾은 방법 자리에 들어간다 — 되짚을 때 "이번 건이 스스로 찾아진 것"과
 * "앞 건을 따라간 것"은 다른 이야기다.
 */
export const THREAD_MATCH_KEY = 'thread';

export function complaintThreadKey(orderNo: string, phone: string): string {
  return `${orderNo.trim()}|${phone.replace(/\D/g, '')}`;
}

export function validateComplaintInput(raw: Record<string, unknown>): string | null {
  const text = (v: unknown) => String(v ?? '').trim();

  // 어느 칸이 비었는지 이름을 짚어 준다 — '입력값을 확인하세요'로는 여덟 칸을
  // 다시 훑어야 한다. 순서는 화면의 칸 순서와 같다.
  const required: Array<[string, string]> = [
    ['product', '주문 대표상품'],
    ['customerName', '수령인 이름'],
    ['phone', '전화번호'],
    ['orderNo', '주문번호'],
    ['receivedAt', '접수일자'],
    ['orderConfirmedAt', '발주확인일'],
    ['calledAt', '통화일시'],
    ['callMemo', '통화내역'],
  ];

  for (const [key, label] of required) {
    const value = text(raw[key]);
    if (!value) return `${label}을(를) 입력해 주세요.`;
    // 날짜 칸은 읽히지 않는 값도 안 넣은 것과 같다.
    const isDate = key === 'receivedAt' || key === 'orderConfirmedAt' || key === 'calledAt';
    if (isDate && !parseDateInput(value)) return `${label}을(를) 다시 확인해 주세요.`;
  }

  if (
    text(raw.customerName).length > 50 ||
    text(raw.phone).length > 30 ||
    text(raw.orderNo).length > 50 ||
    text(raw.callMemo).length > 2000 ||
    text(raw.product).length > 200
  ) {
    return '입력값이 너무 깁니다.';
  }

  return null;
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
 * **지사가 열어 보기만 해도(read_at) 잠근다.** 본 순간 그 내용으로 판단이
 * 시작된다 — 전화를 걸었을 수도, 다른 사람에게 전달했을 수도 있다. 그 뒤에
 * 내용이 조용히 바뀌면 지사는 자기가 본 것과 다른 건을 처리하게 된다.
 *
 * 반려된 건은 여기서 false다 — 관리자가 사유를 적어 되돌린 것 자체가 손을 댄
 * 것이다. 다만 반려는 "고쳐서 다시 보내라"는 뜻이므로 **고치기만** 따로 연다.
 * 아래 canEditComplaint·canDeleteComplaint를 보라.
 */
export function isUntouchedComplaint(row: ComplaintLockInput): boolean {
  if (row.agent_id || row.handled_at || row.read_at) return false;
  if (row.status === 'unassigned') return true;
  return row.status === 'branch' && row.assign_type !== 'manual';
}

/** 잠금을 판단하는 데 필요한 값. 목록·상세·서버가 같은 것을 본다. */
export interface ComplaintLockInput {
  status: ComplaintStatus;
  assign_type: AssignType | null;
  agent_id: number | null;
  handled_at: string | null;
  read_at?: string | null;
}

/**
 * 고칠 수 있는가.
 *
 * 아무도 손대지 않았거나, **반려돼 돌아온 건**이다. 반려는 "이대로는 안 되니
 * 고쳐서 다시 보내라"는 말이라, 못 고치게 하면 그 말을 따를 방법이 없다.
 * 고쳐도 지난 반려는 이력에 그대로 남으므로 왕복한 흔적은 지워지지 않는다.
 */
export function canEditComplaint(row: ComplaintLockInput): boolean {
  return row.status === 'returned' || isUntouchedComplaint(row);
}

/**
 * 지울 수 있는가.
 *
 * **반려된 건은 지울 수 없다.** 고치기와 달리 지우기는 되돌릴 수 없고, 민원이
 * 사라지면 거기 딸린 반려 이력도 함께 사라진다. 그러면 관리자가 무엇을 왜
 * 되돌려 보냈는지가 통째로 없어져, 반려가 마음에 들지 않을 때 지워 버리고
 * 새로 넣는 길이 열린다. 잘못 넣은 것을 물리는 일은 아무도 손대기 전까지다.
 */
export function canDeleteComplaint(row: ComplaintLockInput): boolean {
  return isUntouchedComplaint(row);
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
