import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { canManageGiftRequests } from '@/lib/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const ORDER_LIMIT = 500;

/** 오늘. 발주일은 날짜만 적는다 — 거래처 파일이 날짜 열이다. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 발주 묶음 목록.
 *
 * 건수는 저장하지 않고 그때그때 센다 — 보완으로 빠진 건은 묶음에서 나가므로
 * 만들 때의 수와 지금의 수가 다를 수 있다. 지금의 수가 맞는 수다.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageGiftRequests(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: orders, error } = await supabase
      .from('gift_orders')
      .select('id, created_by, created_at, note')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const ids = (orders ?? []).map((o) => o.id);
    const count = new Map<number, number>();
    const shipped = new Map<number, number>();
    const groups = new Map<number, Set<string>>();
    if (ids.length > 0) {
      const { data: items } = await supabase
        .from('gift_requests')
        .select('order_id, group_name, status')
        .in('order_id', ids);
      for (const item of items ?? []) {
        const id = Number(item.order_id);
        count.set(id, (count.get(id) ?? 0) + 1);
        // 송장이 들어온 건. 실린 건수와 다르면 발주처에 아직 덜 받은 것이다.
        if (item.status === 'shipped') shipped.set(id, (shipped.get(id) ?? 0) + 1);
        if (!groups.has(id)) groups.set(id, new Set());
        groups.get(id)!.add(item.group_name);
      }
    }

    return NextResponse.json({
      data: (orders ?? []).map((o) => ({
        ...o,
        count: count.get(o.id) ?? 0,
        shipped: shipped.get(o.id) ?? 0,
        groups: [...(groups.get(o.id) ?? [])].sort(),
      })),
    });
  } catch (error) {
    console.error('Gift orders list error:', error);
    return NextResponse.json({ error: '발주 묶음을 불러올 수 없습니다.' }, { status: 500 });
  }
}

/**
 * 발주 묶음 만들기.
 *
 * 담당자가 여러 지사에서 올라온 건을 골라 한 번에 묶는다. 실제 발주리스트가
 * 그렇게 나간다 — 한 장에 여러 지사가 섞인다.
 *
 * 발주 대기(forwarded)인 것만 실린다. 다른 상태가 섞여 오면 그 줄만 빠지고
 * 응답에 몇 건이 빠졌는지가 온다(지사 전달 API와 같은 모양). 하나라도 틀렸다고
 * 전부 거부하면 담당자는 어느 줄인지 찾느라 전부를 다시 본다.
 *
 * 묶는 것도 "봤다"다 — read_at이 없던 건은 여기서 찍힌다. 그 뒤로 지사는 못 고친다.
 */
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    if (!canManageGiftRequests(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: '발주할 신청을 골라 주세요.' }, { status: 400 });
    }
    if (ids.length > ORDER_LIMIT) {
      return NextResponse.json(
        { error: `한 번에 ${ORDER_LIMIT}건까지 묶을 수 있습니다.` },
        { status: 400 }
      );
    }

    // 실릴 수 있는 건만 먼저 센다. 하나도 없으면 빈 묶음을 만들지 않는다.
    const { data: ready, error: readyError } = await supabase
      .from('gift_requests')
      .select('id')
      .in('id', ids)
      .eq('status', 'forwarded');
    if (readyError) throw readyError;
    const readyIds = (ready ?? []).map((r) => r.id as number);
    if (readyIds.length === 0) {
      return NextResponse.json(
        { error: '고른 신청 중 발주 대기 상태인 것이 없습니다.' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data: order, error: orderError } = await supabase
      .from('gift_orders')
      .insert({ created_by_id: user.id, created_by: user.username, created_at: now })
      .select('id, created_by, created_at, note')
      .single();
    if (orderError || !order) throw orderError;

    const { data: updated, error: updateError } = await supabase
      .from('gift_requests')
      .update({
        status: 'ordered',
        order_id: order.id,
        order_date: today(),
        updated_at: now,
      })
      .in('id', readyIds)
      // 사이에 상태가 바뀐 건은 실리지 않는다. 다른 담당자가 먼저 묶었을 수 있다.
      .eq('status', 'forwarded')
      .select('id, read_at');
    if (updateError) throw updateError;

    // 안 본 건에 확인 도장. 이미 본 건은 처음 본 시각을 지킨다.
    const unread = (updated ?? []).filter((r) => !r.read_at).map((r) => r.id);
    if (unread.length > 0) {
      await supabase
        .from('gift_requests')
        .update({ read_at: now, read_by: user.username })
        .in('id', unread);
    }

    const ordered = updated?.length ?? 0;
    if (ordered === 0) {
      // 경쟁으로 전부 빠졌다. 빈 묶음은 남기지 않는다.
      await supabase.from('gift_orders').delete().eq('id', order.id);
      return NextResponse.json(
        { error: '고른 신청이 그 사이 다른 상태로 바뀌었습니다. 목록을 새로고침해 주세요.' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { order: { ...order, count: ordered }, ordered, skipped: ids.length - ordered },
      { status: 201 }
    );
  } catch (error) {
    console.error('Gift order create error:', error);
    return NextResponse.json({ error: '발주 묶음을 만들지 못했습니다.' }, { status: 500 });
  }
}
