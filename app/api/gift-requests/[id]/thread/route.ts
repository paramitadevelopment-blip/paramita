import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import {
  canManageGiftRequests,
  canRequestGift,
  canViewAllGiftRequests,
  canViewGiftRequests,
  isAgentRole,
} from '@/lib/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 같은 주문번호로 들어온 신청 전부.
 *
 * 한 주문번호로 여러 상품을 가입하거나 사은품을 추가로 달라는 일이 있어 재신청을
 * 막지 않는다. 대신 관리자가 "또 보내도 되는가"를 판정하는데, 그러려면 **그
 * 주문번호로 지금까지 무엇이 나갔는지**를 다 봐야 한다 — 이번 건만 보고는
 * 세 번째인지 두 번째인지도 모른다.
 *
 * 철회한 것도 낸다. 재신청 판정에서는 안 세지만(없던 일이므로), 사람이 볼 때는
 * "그때 왜 접었나"가 판단에 든다.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canViewGiftRequests(user.role) && !canManageGiftRequests(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const giftId = Number(id);
    if (!Number.isInteger(giftId) || giftId <= 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const { data: gift } = await supabase
      .from('gift_requests')
      .select('id, order_no, group_name, requester_id')
      .eq('id', giftId)
      .maybeSingle();
    if (!gift) {
      return NextResponse.json({ error: '없는 신청입니다.' }, { status: 404 });
    }

    /*
     * 볼 수 있는 사람인지 다시 본다. 화면에서는 자기 것만 열 수 있지만 요청은
     * 직접 만들 수 있다 — 남의 지사 고객의 주소·전화가 열리면 목록을 가려 둔
     * 뜻이 없어진다. 사은품담당자는 전달된 건을 다루므로 전부 볼 수 있다.
     */
    if (!canViewAllGiftRequests(user)) {
      let mine = false;
      if (isAgentRole(user.role)) {
        mine = Number(gift.requester_id) === user.id;
      } else if (canRequestGift(user.role)) {
        const { data: me } = await supabase
          .from('users')
          .select('department')
          .eq('id', user.id)
          .single();
        mine = !!me?.department && me.department === gift.group_name;
      }
      if (!mine) {
        return NextResponse.json({ error: '볼 수 없는 신청입니다.' }, { status: 403 });
      }
    }

    if (!gift.order_no) {
      return NextResponse.json({ data: [] });
    }

    const { data, error } = await supabase
      .from('gift_requests')
      .select(
        'id, order_no, customer_name, gift_name, quantity, address, status, ' +
          'check_reason, checked_by, checked_at, requester_name, group_name, ' +
          'order_id, order_date, courier, tracking_no, ' +
          'supplement_reason, withdraw_reason, created_at'
      )
      .eq('order_no', gift.order_no)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Gift thread error:', error);
      return NextResponse.json({ error: '지난 신청을 불러올 수 없습니다.' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('Gift thread error:', error);
    return NextResponse.json({ error: '지난 신청을 불러올 수 없습니다.' }, { status: 500 });
  }
}
