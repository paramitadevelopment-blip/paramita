import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import {
  canManageGiftRequests,
  canRequestGift,
  canViewAllGiftRequests,
  isAgentRole,
} from '@/lib/roles';
import {
  GIFT_COLUMNS,
  canDeleteGiftRequest,
  canEditGiftRequest,
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
const GUARD_COLUMNS = 'id, status, requester_id, group_name, order_no';

interface Guard {
  id: number;
  status: GiftStatus;
  requester_id: number | null;
  group_name: string;
  order_no: string;
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
  if (canViewAllGiftRequests(user.role)) return true;
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
 *               고객명·전화번호는 여기 없다 — 요청에 실려 와도 버린다.
 *   ship        사은품담당자가 발주하며 발주일·택배사·운송장번호를 적는다.
 *   supplement  사은품담당자가 사유를 적어 되돌린다.
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
        return NextResponse.json(
          { error: '이미 전달된 신청은 고칠 수 없습니다. 보완 요청이 오면 그때 고칩니다.' },
          { status: 409 }
        );
      }
      // 주문번호는 못 바꾼다. 바꾸려면 새로 넣는다 — 고객이 바뀌는 일이다.
      const invalid = validateGiftInput({ ...body, orderNo: guard.order_no });
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      /*
       * 보완 요청을 받은 것을 고치면 다시 '지사 전달 대기'로 돌아간다.
       * 지사가 한 번 더 보고 보내는 것이 이 흐름의 뜻이다. 사유는 비운다 —
       * 고쳤으니 이제 그 사유는 지난 일이다.
       */
      const back =
        guard.status === 'supplement'
          ? { status: 'requested', supplement_reason: null, supplement_by: null, supplement_at: null }
          : {};
      return await applyUpdate(giftId, {
        ...toGiftColumns(readGiftFields(body)),
        ...back,
        updated_at: now,
      });
    }

    /* ── 사은품담당자: 발주 ───────────────────────────────────── */
    if (action === 'ship') {
      if (!canManageGiftRequests(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (guard.status !== 'forwarded' && guard.status !== 'shipped') {
        return NextResponse.json(
          { error: '지사가 전달한 신청만 발주할 수 있습니다.' },
          { status: 400 }
        );
      }
      const invalid = validateShipInput(body);
      if (invalid) {
        return NextResponse.json({ error: invalid }, { status: 400 });
      }
      return await applyUpdate(giftId, {
        status: 'shipped',
        order_date: String(body.orderDate).trim(),
        courier: String(body.courier).trim(),
        tracking_no: String(body.trackingNo).trim(),
        shipped_by: user.username,
        shipped_at: now,
        updated_at: now,
      });
    }

    /* ── 사은품담당자: 보완 요청 ──────────────────────────────── */
    if (action === 'supplement') {
      if (!canManageGiftRequests(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (guard.status !== 'forwarded') {
        return NextResponse.json(
          { error: '발주 전인 신청만 보완을 요청할 수 있습니다.' },
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
          ? '보완 요청을 받은 신청은 지울 수 없습니다. 고쳐서 다시 올려 주세요.'
          : '이미 전달된 신청은 지울 수 없습니다.';
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
