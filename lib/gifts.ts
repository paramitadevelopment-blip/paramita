/**
 * 사은품 신청 — 화면과 서버가 함께 쓰는 정의.
 *
 * 설계사가 신청하고, 지사가 골라 사은품담당자에게 전달하고, 사은품담당자가
 * 발주해 배송 정보를 적는다. 세 사람이 한 건을 차례로 넘긴다.
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
  'created_at, updated_at';

export const GIFT_STATUSES = ['requested', 'forwarded', 'shipped', 'supplement'] as const;
export type GiftStatus = (typeof GIFT_STATUSES)[number];

export const GIFT_STATUS_LABEL: Record<GiftStatus, string> = {
  requested: '지사 전달 대기',
  forwarded: '발주 대기',
  shipped: '발주 완료',
  supplement: '보완 요청',
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

/** 새로 넣을 때 보내는 것. 주문번호 + 고칠 수 있는 칸. 잠긴 칸은 서버가 기록에서 다시 채운다. */
export interface GiftRequestInput extends GiftEditableFields {
  orderNo: string;
}

/** 사은품담당자가 발주하며 적는 것. */
export interface GiftShipInput {
  orderDate: string;
  courier: string;
  trackingNo: string;
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
  sourceFileId: string | null;
  sourceFileName: string | null;
}

const text = (v: unknown) => String(v ?? '').trim();

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
      // 보내는 사람은 지사다. 발주리스트에 '한울부원지사'처럼 적혀 온다.
      senderName: requester.groupName,
      senderPhone: '',
      product,
      // 신규 양식의 고객번호는 표준 양식에서 주문번호 자리에 들어가 있다.
      customerNo: text(row['주문번호']),
      counselor: requester.name,
      settlement: '정산해당',
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

/**
 * 신청한 사람이 아직 고치거나 지울 수 있는가.
 *
 * 지사가 전달하기 전(requested)이거나, 보완을 요청받아 돌아온 것(supplement)만.
 * 전달된 뒤에 내용이 바뀌면 지사가 본 것과 사은품담당자가 받은 것이 달라진다.
 * 발주된 뒤에는 이미 나간 물건이다.
 */
export function canEditGiftRequest(row: { status: GiftStatus }): boolean {
  return row.status === 'requested' || row.status === 'supplement';
}

export function canDeleteGiftRequest(row: { status: GiftStatus }): boolean {
  return row.status === 'requested';
}

export function validateShipInput(raw: Record<string, unknown>): string | null {
  if (!text(raw.orderDate)) return '발주일을 입력해 주세요.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(raw.orderDate))) return '발주일 형식이 잘못됐습니다.';
  if (!text(raw.courier)) return '택배사를 입력해 주세요.';
  if (!text(raw.trackingNo)) return '운송장번호를 입력해 주세요.';
  if (text(raw.courier).length > 50) return '택배사 이름이 너무 깁니다.';
  if (text(raw.trackingNo).length > 50) return '운송장번호가 너무 깁니다.';
  return null;
}
