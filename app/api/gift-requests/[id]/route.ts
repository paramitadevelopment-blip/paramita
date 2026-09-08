import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import {
  canManageGiftRequests,
  canRequestGift,
  canViewAllGiftRequests,
  isAdminRole,
  isAgentRole,
} from '@/lib/roles';
import {
  GIFT_COLUMNS,
  canDeleteGiftRequest,
  canEditGiftRequest,
  canWithdrawGiftRequest,
  readGiftFields,
  toGiftColumns,
  validateGiftInput,
  validateShipInput,
  type GiftStatus,
} from '@/lib/gifts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/** 무엇을 해도 되는지 판단하는 데 필요한 값. */
const GUARD_COLUMNS =
  'id, status, requester_id, group_name, order_no, read_at, order_id, ' +
  'checked_at, check_reason, ship_read_at';

interface Guard {
  id: number;
  status: GiftStatus;
  requester_id: number | null;
  group_name: string;
  order_no: string | null;
  read_at: string | null;
  order_id: number | null;
  /** 같은 주문번호 재신청. 관리자 확인(checked_at)을 받기 전까지는 확인 대기다. */
  checked_at: string | null;
  check_reason: string | null;
  ship_read_at: string | null;
}

async function departmentOf(userId: number): Promise<string | null> {
  const { data } = await supabase.from('users').select('department').eq('id', userId).single();
  return data?.department ?? null;
}

/**
 * 내 신청인가.
 *
 * 설계사는 자기가 넣은 것, 지사는 자기 소속에서 넣은 것. 관리자급은 전부.
 * 화면에서도 같은 기준으로 버튼을 감추지만, 요청은 직접 만들 수 있다.
 */
async function ownsThis(
  row: Guard,
  user: { id: number; role: string }
): Promise<boolean> {
  if (canViewAllGiftRequests(user)) return true;
  if (isAgentRole(user.role)) return Number(row.requester_id) === user.id;
  const department = await departmentOf(user.id);
  return !!department && row.group_name === department;
}

async function applyUpdate(id: number, patch: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('gift_requests')
    .update(patch)
    .eq('id', id)
    .select(GIFT_COLUMNS)
    .single();
  if (error) {
    console.error('Gift request patch error:', error);
    return NextResponse.json({ error: '신청을 바꾸지 못했습니다.' }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/**
 * 한 건을 바꾼다.
 *
 *   update      신청한 쪽이 고친다. 전달 전이거나 보완 요청을 받은 것만.
 *               고객명·전화번호는 늘 잠겨 있다 — 배포 기록의 값이다.
 *   check       관리자가 같은 주문번호 재신청을 확인한다. 보통의 신청이 된다.
 *   ship        사은품담당자가 택배사·운송장번호(필요하면 발주일·배송메세지)를 적는다.
 *   confirmShip 지사가 채워진 배송 정보를 확인한다.
 *   supplement  사은품담당자(또는 확인 단계의 관리자)가 사유를 적어 되돌린다.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { id } = await context.params;
    const giftId = Number(id);
    if (!Number.isInteger(giftId) || giftId <= 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const { data: row, error: loadError } = await supabase
      .from('gift_requests')
      .select(GUARD_COLUMNS)
      .eq('id', giftId)
      .maybeSingle();
    if (loadError) {
      console.error('Gift request load error:', loadError);
      return NextResponse.json({ error: '신청을 불러올 수 없습니다.' }, { status: 500 });
    }
    if (!row) {
      return NextResponse.json({ error: '없는 신청입니다.' }, { status: 404 });
    }
    const guard = row as unknown as Guard;

    const body = await request.json();
    const action = String(body.action ?? '');
    const now = new Date().toISOString();

    /* ── 신청한 쪽이 고치기 ───────────────────────────────────── */
    if (action === 'update') {
      if (!canRequestGift(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!(await ownsThis(guard, user))) {
        return NextResponse.json({ error: '내 신청이 아닙니다.' }, { status: 403 });
      }
      if (!canEditGiftRequest(guard)) {
        const why =
          guard.status === 'forwarded'
            ? '사은품담당자가 이미 확인한 신청은 고칠 수 없습니다. 보완 요청이 오면 그때 고칩니다.'
            : guard.status === 'ordered' || guard.status === 'shipped'
              ? '이미 발주리스트에 담겨 나간 신청은 고칠 수 없습니다.'
              : '이 상태의 신청은 고칠 수 없습니다.';
        return NextResponse.json({ error: why }, { status: 409 });
      }
      // 주문번호는 못 바꾼다. 바꾸려면 새로 넣는다 — 고객이 바뀌는 일이다.
      const invalid = validateGiftInput({ ...body, orderNo: guard.order_no ?? '' });
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      /*
       * 보완 요청을 받은 것을 고치면 다시 담당자의 '발주 대기'로 돌아간다.
       * 사유는 비운다 — 고쳤으니 이제 그 사유는 지난 일이다.
       *
       * 다만 재신청인데 아직 관리자 확인을 못 받은 건은 확인 대기로 돌아간다.
       * 확인을 건너뛰고 담당자에게 가면 관리자를 거치게 한 뜻이 없어진다.
       */
      const reCheck = !!guard.check_reason && !guard.checked_at;
      const back =
        guard.status === 'supplement'
          ? {
              status: reCheck ? 'pending_check' : 'forwarded',
              forwarded_by: user.username,
              forwarded_at: now,
              supplement_reason: null,
              supplement_by: null,
              supplement_at: null,
              /*
               * 담당자의 확인도 비운다. 고친 내용은 담당자가 다시 봐야 하고,
               * 그 전까지는 지사가 더 고칠 수 있어야 한다.
               */
              read_at: null,
              read_by: null,
            }
          : {};
      return await applyUpdate(giftId, {
        ...toGiftColumns(readGiftFields(body)),
        ...back,
        updated_at: now,
      });
    }

    /* ── 신청한 쪽이 철회 ─────────────────────────────────────── */
    if (action === 'withdraw') {
      if (!canRequestGift(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!(await ownsThis(guard, user))) {
        return NextResponse.json({ error: '내 신청이 아닙니다.' }, { status: 403 });
      }
      if (!canWithdrawGiftRequest(guard)) {
        return NextResponse.json(
          { error: '보완 요청을 받은 신청만 철회할 수 있습니다.' },
          { status: 400 }
        );
      }
      const reason = String(body.reason ?? '').trim();
      if (reason.length > 500) {
        return NextResponse.json({ error: '철회 사유가 너무 깁니다.' }, { status: 400 });
      }
      // 지우지 않고 닫는다. 보완 사유도 그대로 둔다 — 왜 되돌렸고 왜 안 하기로 했는지가 한 줄에 남는다.
      return await applyUpdate(giftId, {
        status: 'withdrawn',
        withdrawn_by: user.username,
        withdrawn_at: now,
        withdraw_reason: reason || null,
        updated_at: now,
      });
    }

    /* ── 관리자: 기록 없는 건 확인 ───────────────────────────── */
    if (action === 'check') {
      /*
       * 같은 주문번호로 또 보내도 되는지는 관리자가 판정한다. 사은품담당자에게는
       * 이 권한을 주지 않는다 — 담당자는 발주를 집행하는 자리이고, "또 보내도
       * 되는가"는 그 앞 단계의 판단이다.
       */
      if (!isAdminRole(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (guard.status !== 'pending_check') {
        return NextResponse.json(
          { error: '관리자 확인 대기인 신청만 확인할 수 있습니다.' },
          { status: 400 }
        );
      }
      /*
       * 확인하면 보통의 신청이 된다 — 곧바로 담당자의 발주 대기다. 관리자가
       * 판정한 것은 "이 고객에게 보내도 되는가" 하나뿐이다.
       */
      return await applyUpdate(giftId, {
        status: 'forwarded',
        forwarded_by: user.username,
        forwarded_at: now,
        checked_by: user.username,
        checked_at: now,
        updated_at: now,
      });
    }

    /* ── 사은품담당자: 확인 ───────────────────────────────────── */
    if (action === 'read') {
      if (!canManageGiftRequests(user)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (guard.status !== 'forwarded') {
        return NextResponse.json({ error: '발주 대기인 신청만 확인할 수 있습니다.' }, { status: 400 });
      }
      // 이미 본 건은 그대로 둔다. 처음 본 시각이 진짜 확인 시각이다.
      if (guard.read_at) {
        return NextResponse.json({ error: '이미 확인한 신청입니다.' }, { status: 400 });
      }
      return await applyUpdate(giftId, { read_at: now, read_by: user.username, updated_at: now });
    }

    /* ── 사은품담당자: 배송 정보 ──────────────────────────────── */
    if (action === 'ship') {
      if (!canManageGiftRequests(user)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      /*
       * 발주리스트에 담겨 나간 것만. 발주일은 그때 찍혔고, 여기서는 거래처에서
       * 송장이 나온 뒤 택배사·운송장번호를 채운다. 전달만 된 건(forwarded)은
       * 아직 발주리스트에 안 실렸으니 송장이 있을 수 없다.
       */
      if (guard.status !== 'ordered' && guard.status !== 'shipped') {
        return NextResponse.json(
          { error: '발주리스트에 담긴 신청만 배송 정보를 적을 수 있습니다.' },
          { status: 400 }
        );
      }
      const invalid = validateShipInput(body);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      const orderDate = String(body.orderDate ?? '').trim();
      const memo = String(body.deliveryMemo ?? '').trim();
      return await applyUpdate(giftId, {
        status: 'shipped',
        courier: String(body.courier).trim(),
        tracking_no: String(body.trackingNo).trim(),
        // 적었을 때만 덮어쓴다. 안 적으면 묶을 때 찍힌 발주일·신청 때 적은 메세지가 그대로다.
        ...(orderDate ? { order_date: orderDate } : {}),
        ...(memo ? { delivery_memo: memo } : {}),
        shipped_by: user.username,
        shipped_at: now,
        /*
         * 지사의 확인은 다시 받는다.
         *
         * 고친 값은 다시 봐야 한다 — 운송장번호가 바뀌었는데 지사 화면에 이미
         * '확인함'이 붙어 있으면 바뀐 줄 모르고 지나간다.
         */
        ship_read_at: null,
        ship_read_by: null,
        updated_at: now,
      });
    }

    /* ── 지사: 배송 정보 확인 ─────────────────────────────────── */
    if (action === 'confirmShip') {
      /*
       * 채워진 송장을 신청한 쪽이 봤다. 민원의 '미확인'과 같은 자리다 —
       * 누르기 전까지 지사의 할 일로 배지에 잡힌다.
       */
      if (!canRequestGift(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!(await ownsThis(guard, user))) {
        return NextResponse.json({ error: '내 신청이 아닙니다.' }, { status: 403 });
      }
      if (guard.status !== 'shipped') {
        return NextResponse.json(
          { error: '배송 정보가 채워진 신청만 확인할 수 있습니다.' },
          { status: 400 }
        );
      }
      if (guard.ship_read_at) {
        return NextResponse.json({ error: '이미 확인한 배송 정보입니다.' }, { status: 400 });
      }
      return await applyUpdate(giftId, {
        ship_read_at: now,
        ship_read_by: user.username,
        updated_at: now,
      });
    }

    /* ── 사은품담당자: 보완 요청 ──────────────────────────────── */
    if (action === 'supplement') {
      if (!canManageGiftRequests(user)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      /*
       * 발주리스트를 보낸 뒤에도 되돌릴 수 있다. 한 건에 문제가 생겼다고 묶음
       * 전체를 멈추면 나머지가 같이 선다 — 그 건만 묶음에서 빼서 돌려보낸다.
       * 고쳐 올라오면 다음 묶음에 실린다.
       */
      /*
       * 관리자 확인 대기인 건도 되돌릴 수 있다 — 확인하려고 보니 고객 정보가
       * 모자란 경우다. 그 판단은 관리자만 한다(담당자에게는 아직 안 보인다).
       */
      const checking = guard.status === 'pending_check';
      if (checking && !isAdminRole(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!checking && guard.status !== 'forwarded' && guard.status !== 'ordered') {
        return NextResponse.json(
          { error: '발주 대기·발주 보냄 상태인 신청만 보완을 요청할 수 있습니다.' },
          { status: 400 }
        );
      }
      const reason = String(body.reason ?? '').trim();
      if (!reason) {
        return NextResponse.json({ error: '보완 사유를 적어 주세요.' }, { status: 400 });
      }
      if (reason.length > 500) {
        return NextResponse.json({ error: '보완 사유가 너무 깁니다.' }, { status: 400 });
      }
      return await applyUpdate(giftId, {
        status: 'supplement',
        supplement_reason: reason,
        supplement_by: user.username,
        supplement_at: now,
        // 발주 묶음에서는 뺀다. 발주일도 비운다 — 다시 올라오면 새 묶음에서 새로 찍힌다.
        order_id: null,
        order_date: null,
        // 담당자가 되돌린 것도 '봤다'는 뜻이다. 관리자 확인 단계의 반려는 아니다 —
        // 그건 담당자에게 아직 가지도 않은 건이라 read_at을 찍으면 뜻이 어긋난다.
        ...(checking || guard.read_at ? {} : { read_at: now, read_by: user.username }),
        updated_at: now,
      });
    }

    return NextResponse.json({ error: '알 수 없는 동작입니다.' }, { status: 400 });
  } catch (error) {
    console.error('Gift request PATCH error:', error);
    return NextResponse.json({ error: '신청을 바꾸지 못했습니다.' }, { status: 500 });
  }
}

/**
 * 신청을 지운다. 전달 전(requested)에 신청한 쪽만.
 *
 * 보완 요청을 받은 것은 못 지운다 — 사은품담당자가 되돌린 기록이 함께 사라진다.
 * 고쳐서 다시 올리는 것이 맞다.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    if (!canRequestGift(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const giftId = Number(id);
    if (!Number.isInteger(giftId) || giftId <= 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const { data: row } = await supabase
      .from('gift_requests')
      .select(GUARD_COLUMNS)
      .eq('id', giftId)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: '없는 신청입니다.' }, { status: 404 });
    }
    const guard = row as unknown as Guard;

    if (!(await ownsThis(guard, user))) {
      return NextResponse.json({ error: '내 신청이 아닙니다.' }, { status: 403 });
    }
    if (!canDeleteGiftRequest(guard)) {
      const reason =
        guard.status === 'supplement'
          ? '보완 요청을 받은 신청은 지울 수 없습니다. 고쳐서 다시 올리거나 철회하세요.'
          : '사은품담당자가 이미 확인한 신청은 지울 수 없습니다.';
      return NextResponse.json({ error: reason }, { status: 409 });
    }

    const { error } = await supabase.from('gift_requests').delete().eq('id', giftId);
    if (error) {
      console.error('Gift request delete error:', error);
      return NextResponse.json({ error: '신청을 지우지 못했습니다.' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Gift request DELETE error:', error);
    return NextResponse.json({ error: '신청을 지우지 못했습니다.' }, { status: 500 });
  }
}
