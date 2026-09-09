/**
 * 사은품 신청 — 화면과 서버가 함께 쓰는 정의.
 *
 * 지사가 건을 등록하면 그대로 사은품담당자에게 뜬다. 담당자는 건을 골라
 * 발주리스트를 만들고, 송장이 나오면 배송 정보를 적는다. 내용이 이상하면
 * 그 건만 되돌린다. 지사 쪽에서 모아 두는 단계는 없다 — 등록이 곧 전달이다.
 *
 * 신청은 주문번호 하나로 시작한다. 그 번호로 우리가 배포한 기록을 찾아 고객
 * 정보를 끌어오고, 설계사는 나머지 칸만 채운다. **고객명과 전화번호는 기록에서
 * 온 그대로 잠근다** — 사은품이 엉뚱한 사람에게 가는 사고는 대개 이름과
 * 번호를 손으로 옮겨 적다 생긴다.
 */

/** 목록·상세를 그릴 때 읽는 열. 두 화면과 서버가 같은 것을 본다. */
export const GIFT_COLUMNS =
  'id, order_no, source_file_id, source_file_name, ' +
  'order_date, courier, tracking_no, ' +
  'customer_name, phone1, phone2, zip, address, delivery_memo, ' +
  'gift_name, quantity, note, sender_name, sender_phone, ' +
  'product, customer_no, counselor, settlement, ' +
  'requester_id, requester_name, group_name, ' +
  'status, forwarded_by, forwarded_at, shipped_by, shipped_at, ' +
  'supplement_reason, supplement_by, supplement_at, ' +
  'withdrawn_by, withdrawn_at, withdraw_reason, ' +
  'order_id, read_at, read_by, checked_by, checked_at, check_reason, ' +
  'ship_read_at, ship_read_by, ' +
  'created_at, updated_at, ' +
  // 지나간 보완. 신청 행의 supplement_* 는 '지금 보완 상태인가'만 나타낸다.
  'gift_supplements(reason, returned_by, returned_at)';

/*
 * 한 건이 거치는 자리.
 *   pending_check 같은 주문번호로 다시 신청함. 사유를 달고 관리자 확인 대기
 *   forwarded   지사가 등록함. 곧바로 담당자의 발주 대기다
 *   ordered     담당자가 발주리스트에 담아 거래처에 보냄. 송장은 아직
 *   shipped     택배사·운송장번호가 채워짐
 *   supplement  담당자가 되돌림. 지사가 고쳐 다시 올린다
 *   withdrawn   지사가 닫음
 *
 * 순서가 곧 화면 탭 순서다. 'requested'(지사 전달 대기)는 없다 — 지사가 모아
 * 두었다가 보내는 단계를 없앴다. 등록하면 바로 담당자에게 간다.
 */
export const GIFT_STATUSES = [
  'pending_check',
  'forwarded',
  'ordered',
  'shipped',
  'supplement',
  'withdrawn',
] as const;
export type GiftStatus = (typeof GIFT_STATUSES)[number];

export const GIFT_STATUS_LABEL: Record<GiftStatus, string> = {
  // 같은 주문번호의 두 번째 신청. 관리자가 사유를 보고 "또 보내도 되는가"를 본다.
  pending_check: '관리자 확인 대기',
  forwarded: '발주 대기',
  ordered: '발주 보냄',
  shipped: '배송 정보 입력됨',
  supplement: '보완 요청',
  // 신청한 쪽이 "이 신청은 진행하지 않는다"로 닫은 것. 기록은 남는다.
  withdrawn: '철회',
};

export interface GiftRequestRow {
  id: number;
  order_no: string;
  source_file_id: string | null;
  source_file_name: string | null;

  order_date: string | null;
  courier: string | null;
  tracking_no: string | null;
  customer_name: string;
  phone1: string | null;
  phone2: string | null;
  zip: string | null;
  address: string | null;
  delivery_memo: string | null;
  gift_name: string;
  quantity: number;
  note: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  product: string | null;
  customer_no: string | null;
  counselor: string | null;
  settlement: string | null;

  requester_id: number | null;
  requester_name: string;
  group_name: string;

  status: GiftStatus;
  forwarded_by: string | null;
  forwarded_at: string | null;
  shipped_by: string | null;
  shipped_at: string | null;
  supplement_reason: string | null;
  supplement_by: string | null;
  supplement_at: string | null;
  withdrawn_by: string | null;
  withdrawn_at: string | null;
  withdraw_reason: string | null;
  /** 어느 발주 묶음에 실렸나. 보완으로 빠지면 비워진다. */
  order_id: number | null;
  /** 담당자가 봤다. 이 뒤로 지사는 못 고친다. */
  read_at: string | null;
  read_by: string | null;
  /** 같은 주문번호 재신청을 관리자가 확인했다. 확인 뒤 보통의 신청이 된다. */
  checked_by: string | null;
  checked_at: string | null;
  /** 왜 다시 보내는지. 재신청 건에만 있다. */
  check_reason: string | null;
  /**
   * 지나간 보완 전부. 고쳐서 다시 올리면 위의 supplement_* 는 비워지지만
   * 여기 기록은 남는다 — 몇 번 오갔고 그때마다 무엇이 문제였는지가 그 건의 사정이다.
   */
  gift_supplements?: Array<{ reason: string; returned_by: string; returned_at: string }>;
  /** 채워진 배송 정보를 지사가 확인했다. 담당자가 고치면 다시 비워진다. */
  ship_read_at: string | null;
  ship_read_by: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * 설계사가 고칠 수 있는 칸.
 *
 * 고객명·전화번호1·2는 없다 — 기록에서 온 값을 잠근다. 주소·우편번호는 기록에
 * 있지만 고칠 수 있다: 이사했거나 다른 곳으로 받고 싶은 경우가 있다.
 * 발주일·택배사·운송장번호도 없다 — 사은품담당자가 발주하며 적는 칸이다.
 */
export interface GiftEditableFields {
  zip: string;
  address: string;
  deliveryMemo: string;
  giftName: string;
  quantity: number;
  note: string;
  senderName: string;
  senderPhone: string;
  product: string;
  customerNo: string;
  counselor: string;
  settlement: string;
}

/**
 * 새로 넣을 때 보내는 것. 주문번호 + 고칠 수 있는 칸.
 *
 * 고객명·전화번호는 없다 — 서버가 배포 기록에서 다시 채운다. 같은 주문번호로
 * 이미 신청된 건이 있으면 checkReason(왜 또 보내는지)을 함께 보내야 하고, 그
 * 건은 관리자 확인을 거친다.
 */
export interface GiftRequestInput extends GiftEditableFields {
  orderNo: string;
  checkReason?: string;
}

/** 같은 주문번호로 이미 들어가 있는 신청. 재신청 창에서 "전에 무엇을 보냈나"를 보여준다. */
export interface PriorGiftRequest {
  id: number;
  gift_name: string;
  quantity: number;
  status: GiftStatus;
  created_at: string;
  requester_name: string;
  address: string | null;
}

/**
 * 사은품담당자가 송장이 나온 뒤 적는 것.
 *
 * 택배사·운송장번호는 거래처에 보낸 뒤에야 나오는 값이라 따로 받는다.
 * 발주일은 발주리스트를 만들 때 찍히지만, 거래처가 실제로 내보낸 날이 다르면
 * 여기서 고친다. 배송메세지도 이때 붙는 일이 있다("부재 시 경비실") —
 * 신청 때 안 적었어도 송장을 넣으며 함께 적을 수 있게 둔다.
 */
export interface GiftShipInput {
  courier: string;
  trackingNo: string;
  orderDate?: string;
  deliveryMemo?: string;
}

/**
 * 배포 기록 한 줄에서 신청서를 미리 채운다.
 *
 * 기록의 열 이름은 변환이 끝난 표준 양식(lib/columnAliases.ts의 OUTPUT_HEADERS)
 * 이다 — 신규 양식의 '고객번호'는 이미 '주문번호'로, '휴대폰'은 'Tel1'로 바뀌어
 * 있다. 그래서 여기서는 표준 이름만 본다.
 *
 * 사은품명은 상품명 끝의 괄호에서 꺼낸다. '흥국화재(든든한3N5)_상담예약(보관에어프라이어)'
 * 처럼 마지막 괄호가 사은품인 것이 거래처 양식의 관례다. 못 꺼내면 비워 둔다 —
 * 잘못 채워 놓으면 그대로 발주된다.
 */
export interface GiftPrefill {
  /** 잠기는 값. 화면은 보여주기만 하고 서버는 이 값을 다시 계산해 저장한다. */
  locked: { customerName: string; phone1: string; phone2: string };
  /** 채워 두되 고칠 수 있는 값. */
  fields: GiftEditableFields;
  /** 그 고객이 배정된 소속(departments.name). 남의 지사 고객인지 여기서 가른다. */
  assignedDept: string;
  /** 같은 주문번호로 이미 들어간 신청. 있으면 재신청이라 사유가 필요하다. */
  existing?: PriorGiftRequest[];
  sourceFileId: string | null;
  sourceFileName: string | null;
}

const text = (v: unknown) => String(v ?? '').trim();

/** '한울부원' → '한울부원지사'. 이미 '지사'로 끝나면 그대로. 거래처 파일의 표기다. */
export function withBranchSuffix(groupName: string): string {
  const name = text(groupName);
  if (!name) return '';
  return name.endsWith('지사') ? name : `${name}지사`;
}

/**
 * 정산구분 — 보내시는분이 누구냐로 갈린다.
 *
 * 파라인슈가 보내는 건은 DB를 우리가 준 건이라 'DB포함'으로 나가고, 나머지
 * 지사는 '정산해당'이다. 거래처가 이 칸을 보고 정산을 가르므로 보내는 쪽이
 * 바뀌면 이 값도 따라 바뀌어야 한다.
 *
 * 기본값을 정하는 데 쓴다 — 화면에서 고칠 수 있는 칸이다. 예외가 있으면 사람이
 * 고쳐 적는다.
 */
export const SETTLEMENT_DEFAULT = '정산해당';
export const SETTLEMENT_DB_INCLUDED = 'DB포함';

export function settlementFor(senderName: string): string {
  return text(senderName).includes('파라인슈') ? SETTLEMENT_DB_INCLUDED : SETTLEMENT_DEFAULT;
}

export function giftNameFromProduct(product: string): string {
  const matches = product.match(/\(([^()]*)\)/g);
  if (!matches || matches.length === 0) return '';
  const last = matches[matches.length - 1];
  return last.slice(1, -1).trim();
}

export function prefillFromRecord(
  row: Record<string, unknown>,
  file: { id: string | null; name: string | null },
  requester: { name: string; groupName: string }
): GiftPrefill {
  const product = text(row['상품명']);
  return {
    locked: {
      customerName: text(row['고객명']),
      phone1: text(row['Tel1']),
      phone2: text(row['Tel2']),
    },
    fields: {
      zip: text(row['우편번호']),
      address: text(row['주소']),
      deliveryMemo: text(row['배송메세지']),
      giftName: giftNameFromProduct(product),
      quantity: 1,
      note: '',
      // 보내는 사람은 지사다. 발주리스트에 '한울부원지사'처럼 적혀 온다 — 접미를 맞춘다.
      senderName: withBranchSuffix(requester.groupName),
      senderPhone: '',
      product,
      // 신규 양식의 고객번호는 표준 양식에서 주문번호 자리에 들어가 있다.
      customerNo: text(row['주문번호']),
      /*
       * 상담원은 비워 둔다.
       *
       * 지사가 소속 건을 모아 넣으므로, 신청자 이름을 적으면 발주리스트의
       * '상담원'이 전부 지사 계정 이름이 된다. 실제로 상담한 설계사 이름은
       * 지사가 알고 있으니 그 자리에서 적는다.
       */
      counselor: '',
      // 보내는 쪽에 따라 갈린다. 파라인슈는 'DB포함', 나머지는 '정산해당'.
      settlement: settlementFor(withBranchSuffix(requester.groupName)),
    },
    assignedDept: text(row['배정소속']),
    sourceFileId: file.id,
    sourceFileName: file.name,
  };
}

/**
 * 신청서 검사. 화면과 서버가 같은 규칙을 본다.
 *
 * 필수는 발주리스트 엑셀에 '*필수'로 표시된 것 중 설계사가 채우는 칸이다.
 * 발주일·택배사·운송장번호는 필수 표시가 있어도 여기서 안 본다 — 사은품담당자가
 * 발주할 때 적는 칸이라, 신청 단계에서 요구하면 아무도 신청을 못 한다.
 */
export function validateGiftInput(raw: Record<string, unknown>): string | null {
  const need: Array<[keyof GiftRequestInput, string]> = [
    ['orderNo', '주문번호'],
    ['address', '주소'],
    ['giftName', '사은품명'],
    ['senderName', '보내시는분'],
    ['senderPhone', '보내시는분 연락처'],
    ['product', '상품명(방송사)'],
  ];
  for (const [key, label] of need) {
    if (!text(raw[key])) return `${label}을(를) 입력해 주세요.`;
  }

  if (text(raw.checkReason).length > 500) return '재신청 사유가 너무 깁니다. (500자까지)';

  const quantity = Number(raw.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return '수량은 1 이상의 정수여야 합니다.';
  if (quantity > 99) return '수량이 너무 많습니다. 확인해 주세요.';

  const limits: Array<[keyof GiftRequestInput, number, string]> = [
    ['orderNo', 50, '주문번호'],
    ['zip', 10, '우편번호'],
    ['address', 300, '주소'],
    ['deliveryMemo', 300, '배송메세지'],
    ['giftName', 100, '사은품명'],
    ['note', 500, '비고'],
    ['senderName', 50, '보내시는분'],
    ['senderPhone', 20, '보내시는분 연락처'],
    ['product', 200, '상품명(방송사)'],
    ['customerNo', 50, '고객번호'],
    ['counselor', 50, '상담원'],
    ['settlement', 30, '정산구분'],
  ];
  for (const [key, max, label] of limits) {
    if (text(raw[key]).length > max) return `${label}이(가) 너무 깁니다. (${max}자까지)`;
  }
  return null;
}

/** 요청 본문에서 고칠 수 있는 칸만 꺼낸다. 잠긴 칸이 섞여 와도 버린다. */
export function readGiftFields(raw: Record<string, unknown>): GiftEditableFields {
  return {
    zip: text(raw.zip),
    address: text(raw.address),
    deliveryMemo: text(raw.deliveryMemo),
    giftName: text(raw.giftName),
    quantity: Number(raw.quantity) || 1,
    note: text(raw.note),
    senderName: text(raw.senderName),
    senderPhone: text(raw.senderPhone),
    product: text(raw.product),
    customerNo: text(raw.customerNo),
    counselor: text(raw.counselor),
    settlement: text(raw.settlement),
  };
}

/** 고칠 수 있는 칸을 DB 열 이름으로 옮긴다. */
export function toGiftColumns(fields: GiftEditableFields): Record<string, unknown> {
  return {
    zip: fields.zip || null,
    address: fields.address || null,
    delivery_memo: fields.deliveryMemo || null,
    gift_name: fields.giftName,
    quantity: fields.quantity,
    note: fields.note || null,
    sender_name: fields.senderName || null,
    sender_phone: fields.senderPhone || null,
    product: fields.product || null,
    customer_no: fields.customerNo || null,
    counselor: fields.counselor || null,
    settlement: fields.settlement || null,
  };
}

/** 잠금을 판단하는 데 필요한 값. 화면·서버가 같은 것을 본다. */
export interface GiftLockInput {
  status: GiftStatus;
  read_at?: string | null;
}

/**
 * 신청한 쪽이 아직 고칠 수 있는가.
 *
 * 민원과 같은 규칙이다 — **윗선이 아직 아무 행위도 안 했으면** 고칠 수 있다.
 *   pending_check 재신청 확인 대기. 아직 아무도 안 봤다. 여기서 고쳐도 된다
 *   supplement  보완을 요청받아 돌아온 것. 고치라고 돌려보낸 것이다
 *   forwarded   등록은 됐지만 담당자가 아직 안 봤으면(read_at 없음) 된다.
 *               담당자가 확인·발주·보완 중 무엇이든 하는 순간 read_at이 찍혀 닫힌다
 * 발주된 뒤(ordered·shipped)는 이미 나간 물건이라 안 된다.
 */
export function canEditGiftRequest(row: GiftLockInput): boolean {
  if (row.status === 'pending_check' || row.status === 'supplement') return true;
  return row.status === 'forwarded' && !row.read_at;
}

/**
 * 지울 수 있는가.
 *
 * 신청한 쪽은 담당자가 아직 손대지 않은 것만 지운다. 고칠 수 있는 것과 같은
 * 선이되 보완 요청은 뺀다 — 되돌아온 건을 지우면 보완 이력까지 사라진다.
 * 그건 고쳐 올리거나 철회한다.
 *
 * 관리자(admin·subadmin)는 상태와 무관하게 지운다. 잘못 들어간 개인정보나
 * 시험 삼아 넣은 건은 닫아 두는 것으로 안 되고 없애야 한다. 대신 사유를 받아
 * 보관본을 남긴다(deleted_gift_requests) — 민원의 관리자 삭제와 같은 방식이다.
 */
export function canDeleteGiftRequest(row: GiftLockInput, isAdmin = false): boolean {
  if (isAdmin) return true;
  if (row.status === 'pending_check') return true;
  return row.status === 'forwarded' && !row.read_at;
}

/**
 * 담당자가 아직 안 본 발주 대기 건인가.
 *
 * 상세를 여는 것이 곧 확인이다 — 버튼을 따로 두면 안 누르고 지나가고, 그동안
 * 지사가 내용을 고쳐 담당자가 본 것과 다른 건이 발주된다. 민원의 '상세 열기 =
 * 확인'과 같은 규칙이다. 이 함수는 "열었을 때 확인을 찍어야 하는가"를 가른다.
 */
export function needsStaffRead(row: GiftLockInput): boolean {
  return row.status === 'forwarded' && !row.read_at;
}

/**
 * 관리자 확인을 기다리는 건인가.
 *
 * 같은 주문번호로 두 번째 보내는 건이라 "또 보내도 되는가"를 사람이 봐야 한다.
 * 확인 전에는 담당자에게 가지 않는다 — 관리 화면은 forwarded부터 본다.
 */
export function needsAdminCheck(row: { status: GiftStatus }): boolean {
  return row.status === 'pending_check';
}

/**
 * 철회할 수 있는가. 보완 요청을 받은 건만이다.
 *
 * 진행할 필요가 없어진 건은 고쳐 올릴 것도 없고 지울 수도 없어 나갈 길이
 * 없었다. 철회는 지우지 않고 닫는 것이다 — 누가 왜 되돌렸고 왜 안 하기로
 * 했는지가 그대로 남는다.
 */
export function canWithdrawGiftRequest(row: { status: GiftStatus }): boolean {
  return row.status === 'supplement';
}

export function validateShipInput(raw: Record<string, unknown>): string | null {
  if (!text(raw.courier)) return '택배사를 입력해 주세요.';
  if (!text(raw.trackingNo)) return '운송장번호를 입력해 주세요.';
  if (text(raw.courier).length > 50) return '택배사 이름이 너무 깁니다.';
  if (text(raw.trackingNo).length > 50) return '운송장번호가 너무 깁니다.';
  if (text(raw.deliveryMemo).length > 300) return '배송메세지가 너무 깁니다. (300자까지)';
  // 발주일은 비워 둘 수 있다(묶을 때 찍힌 날을 그대로 둔다). 적었다면 날짜여야 한다.
  const orderDate = text(raw.orderDate);
  if (orderDate && !/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    return '발주일을 다시 확인해 주세요.';
  }
  return null;
}

/** 며칠이 지났나. 날짜 단위로 센다 — 시각까지 따지면 '어제 것'이 오늘 걸렸다 안 걸렸다 한다. */
export function daysSince(iso: string | null, now: Date = new Date()): number {
  if (!iso) return 0;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const passed = (day(now) - day(new Date(iso))) / 86400000;
  return passed > 0 ? Math.floor(passed) : 0;
}

/** 며칠부터 밀린 것으로 보나. 민원과 같은 사흘이다. */
export const GIFT_OVERDUE_DAYS = 3;

/** 그 상태에서 기다리기 시작한 시각. 자리마다 기다리는 사람이 다르다. */
export function waitingSince(row: {
  status: GiftStatus;
  created_at: string;
  forwarded_at?: string | null;
  order_date?: string | null;
  supplement_at?: string | null;
}): string | null {
  switch (row.status) {
    // 관리자가 봐 줘야 넘어간다. 넣은 날부터 센다.
    case 'pending_check':
      return row.created_at;
    // 담당자가 발주에 담아야 넘어간다.
    case 'forwarded':
      return row.forwarded_at ?? row.created_at;
    // 발주처에서 송장이 와야 넘어간다.
    case 'ordered':
      return row.order_date ?? row.created_at;
    // 지사가 고쳐 올려야 넘어간다.
    case 'supplement':
      return row.supplement_at ?? row.created_at;
    // 끝난 자리. 기다리는 사람이 없다.
    default:
      return null;
  }
}

/**
 * 밀린 건인가.
 *
 * 아직 누군가 손대야 하는 자리만 센다. 그래야 목록에서 색이 붙은 줄이 곧
 * '지금 손봐야 할 것'이 된다 — 민원의 isOverdueComplaint와 같은 생각이다.
 */
export function isOverdueGiftRequest(
  row: {
    status: GiftStatus;
    created_at: string;
    forwarded_at?: string | null;
    order_date?: string | null;
    supplement_at?: string | null;
  },
  now: Date = new Date()
): boolean {
  const since = waitingSince(row);
  if (!since) return false;
  return daysSince(since, now) >= GIFT_OVERDUE_DAYS;
}

/**
 * 배송 정보를 적을 수 있는가.
 *
 * 발주리스트에 담겨 나간 것만이다. 전달만 된 건은 아직 발주처에 안 갔으니
 * 송장이 있을 수 없고, **이미 채워진 건은 물건이 나간 뒤라 못 고친다** —
 * 운송장번호가 나왔다는 것은 이미 발송했다는 뜻이고, 그 뒤에 바꿀 일이
 * 생겼다면 같은 발송의 수정이 아니라 새 발송이다. 새로 신청한다.
 */
export function canShipGiftRequest(row: { status: GiftStatus }): boolean {
  return row.status === 'ordered';
}

/**
 * 지사가 아직 안 본 배송 정보인가.
 *
 * 담당자가 송장을 채우면 그것을 기다리던 쪽은 신청한 지사다. 확인을 누르기
 * 전까지 지사의 할 일로 센다 — 민원의 '미확인'과 같은 뜻이다.
 */
export function needsShipCheck(row: { status: GiftStatus; ship_read_at?: string | null }): boolean {
  return row.status === 'shipped' && !row.ship_read_at;
}
