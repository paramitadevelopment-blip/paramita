import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { canManageGiftRequests } from '@/lib/roles';
import { GIFT_COLUMNS } from '@/lib/gifts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 발주 묶음 하나와 그 안의 건들.
 *
 * "지금 이 묶음에 실려 있는 것"만 준다. 보완 요청으로 빠진 건은 order_id가
 * 비워져 여기 안 나온다 — 묶음은 문이 아니라 꼬리표라, 빠진 건은 빠진 것이다.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageGiftRequests(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const orderId = Number(id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const { data: order } = await supabase
      .from('gift_orders')
      .select('id, created_by, created_at, note')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) {
      return NextResponse.json({ error: '없는 발주 묶음입니다.' }, { status: 404 });
    }

    const { data: items, error } = await supabase
      .from('gift_requests')
      .select(GIFT_COLUMNS)
      .eq('order_id', orderId)
      // 거래처 파일에서 지사끼리 모여 있어야 보기 편하다.
      .order('group_name', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;

    const rows = (items ?? []) as unknown as Array<{ group_name: string; status: string }>;
    return NextResponse.json({
      data: {
        order: {
          ...order,
          count: rows.length,
          shipped: rows.filter((r) => r.status === 'shipped').length,
          groups: [...new Set(rows.map((r) => r.group_name))].sort(),
        },
        items: items ?? [],
      },
    });
  } catch (error) {
    console.error('Gift order detail error:', error);
    return NextResponse.json({ error: '발주 묶음을 불러올 수 없습니다.' }, { status: 500 });
  }
}
