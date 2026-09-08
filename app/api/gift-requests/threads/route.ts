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

/** 한 번에 물어볼 수 있는 건수. 확인 대기 목록 한 쪽(10건)을 덮고도 남는다. */
const LIMIT = 50;

const THREAD_COLUMNS =
  'id, order_no, customer_name, gift_name, quantity, address, status, ' +
  'check_reason, checked_by, checked_at, requester_name, group_name, ' +
  'order_id, order_date, courier, tracking_no, ' +
  'supplement_reason, withdraw_reason, created_at';

/**
 * 여러 건의 '같은 주문번호 묶음'을 한 번에.
 *
 * 확인 대기 목록은 줄마다 다른 주문번호다. 그 줄만 보고는 두 번째인지 세 번째인지,
 * 지난번에 뭘 보냈는지를 모른다 — 그래서 목록을 그릴 때 각 줄의 묶음을 함께
 * 받아 한자리에 세운다. 줄마다 따로 물으면 한 쪽에 열 번을 묻게 된다.
 *
 * 돌려주는 것은 주문번호별 묶음이다. 같은 번호가 목록에 두 줄 있어도 한 번만 온다.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canViewGiftRequests(user.role) && !canManageGiftRequests(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const raw = (new URL(request.url).searchParams.get('orderNos') || '').trim();
    const orderNos = [...new Set(raw.split(',').map((v) => v.trim()).filter(Boolean))].slice(0, LIMIT);
    if (orderNos.length === 0) {
      return NextResponse.json({ data: {} });
    }

    let query = supabase.from('gift_requests').select(THREAD_COLUMNS).in('order_no', orderNos);

    /*
     * 볼 수 있는 범위로 좁힌다. 화면에서는 자기 것만 열지만 요청은 직접 만들 수
     * 있다 — 남의 지사 고객의 주소·전화가 열리면 목록을 가려 둔 뜻이 없어진다.
     */
    if (!canViewAllGiftRequests(user)) {
      if (isAgentRole(user.role)) {
        query = query.eq('requester_id', user.id);
      } else if (canRequestGift(user.role)) {
        const { data: me } = await supabase
          .from('users')
          .select('department')
          .eq('id', user.id)
          .single();
        if (!me?.department) {
          return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
        }
        query = query.eq('group_name', me.department);
      }
    }

    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;

    const grouped: Record<string, unknown[]> = {};
    for (const row of (data ?? []) as unknown as Array<{ order_no: string }>) {
      const key = String(row.order_no);
      (grouped[key] ??= []).push(row);
    }
    return NextResponse.json({ data: grouped });
  } catch (error) {
    console.error('Gift threads error:', error);
    return NextResponse.json({ error: '지난 신청을 불러올 수 없습니다.' }, { status: 500 });
  }
}
