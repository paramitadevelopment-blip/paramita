import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { canManageGiftRequests } from '@/lib/roles';
import { GIFT_COLUMNS, type GiftRequestRow } from '@/lib/gifts';
import { orderWorkbookBuffer, orderSheetFileName } from '@/lib/giftOrderSheet';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 발주 묶음을 거래처 양식 엑셀로 내려받는다.
 *
 * 몇 번이고 다시 받을 수 있다 — 보완으로 한 건이 빠졌으면 빠진 채로, 송장이
 * 채워졌으면 채워진 채로 그때의 모습이 나온다. 파일은 저장하지 않는다.
 * 저장해 두면 그 사이 바뀐 것과 어긋난 파일이 남는다.
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
      .select('id, created_at')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) {
      return NextResponse.json({ error: '없는 발주 묶음입니다.' }, { status: 404 });
    }

    const { data: items, error } = await supabase
      .from('gift_requests')
      .select(GIFT_COLUMNS)
      .eq('order_id', orderId)
      .order('group_name', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;

    const rows = (items ?? []) as unknown as GiftRequestRow[];
    const buffer = await orderWorkbookBuffer(rows);
    // 파일 이름의 날짜는 묶음을 만든 날이다. 오늘로 하면 다시 받을 때마다 이름이 바뀐다.
    const fileName = orderSheetFileName(rows.length, new Date(order.created_at));

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // 한글 이름은 RFC 5987 로. 그냥 넣으면 브라우저마다 깨진다.
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Gift order excel error:', error);
    return NextResponse.json({ error: '엑셀을 만들지 못했습니다.' }, { status: 500 });
  }
}
