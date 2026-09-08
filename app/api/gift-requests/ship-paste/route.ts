import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { canManageGiftRequests } from '@/lib/roles';
import { GIFT_COLUMNS } from '@/lib/gifts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const BULK_LIMIT = 500;

interface Candidate {
  id: number;
  order_no: string;
  gift_name: string;
  quantity: number;
  customer_name: string;
  status: string;
  order_id: number | null;
}

/**
 * 발주처가 채워 돌려준 표를 그대로 붙여넣어 배송 정보를 채운다.
 *
 * 보낸 발주리스트가 **발주일·택배사·운송장번호**가 채워져 돌아온다. 열두 건이면
 * 열두 번 창을 열어 송장을 옮겨 적던 일을 한 번에 끝낸다.
 *
 * **고객번호(=주문번호)가 우리 것과 맞는 줄만 채운다.** 발주처 파일에는 다른
 * 회사 건이 섞여 있다 — 안 맞는 줄은 오류가 아니라 남의 줄이라 조용히 건너뛴다.
 *
 * 한 주문번호에 발주된 건이 여럿일 수 있다(재신청). 그때는 사은품명이 같은 것을
 * 먼저 고르고, 이미 채운 건은 다시 고르지 않는다 — 같은 고객의 두 줄이 한 건에
 * 겹쳐 들어가면 하나는 송장 없이 남는다.
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
    const rows: Array<Record<string, unknown>> = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: '붙여넣은 내용이 없습니다.' }, { status: 400 });
    }
    if (rows.length > BULK_LIMIT) {
      return NextResponse.json(
        { error: `한 번에 ${BULK_LIMIT}줄까지 읽을 수 있습니다.` },
        { status: 400 }
      );
    }

    const orderNos = [
      ...new Set(rows.map((r) => String(r.orderNo ?? '').trim()).filter(Boolean)),
    ];

    /*
     * 채울 수 있는 건만 후보로 든다 — 발주리스트에 실려 나간 것(ordered)과 이미
     * 채워진 것(shipped). 아직 발주 전이거나 되돌린 건은 발주처가 들고 있을 수
     * 없으므로 그 줄은 남의 줄로 본다.
     */
    const { data: found, error: findError } = await supabase
      .from('gift_requests')
      .select('id, order_no, gift_name, quantity, customer_name, status, order_id')
      .in('order_no', orderNos.length > 0 ? orderNos : [''])
      .in('status', ['ordered', 'shipped'])
      .order('id', { ascending: true });
    if (findError) throw findError;

    const byOrderNo = new Map<string, Candidate[]>();
    for (const row of (found ?? []) as unknown as Candidate[]) {
      const key = String(row.order_no);
      const list = byOrderNo.get(key);
      if (list) list.push(row);
      else byOrderNo.set(key, [row]);
    }

    const used = new Set<number>();
    const results: Array<{
      at: number;
      ok: boolean;
      skipped?: boolean;
      reason?: string;
      data?: unknown;
    }> = [];
    const now = new Date().toISOString();

    for (const [at, raw] of rows.entries()) {
      const orderNo = String(raw.orderNo ?? '').trim();
      const giftName = String(raw.giftName ?? '').trim();
      const courier = String(raw.courier ?? '').trim();
      const trackingNo = String(raw.trackingNo ?? '').trim();
      const orderDate = String(raw.orderDate ?? '').trim();
      const deliveryMemo = String(raw.deliveryMemo ?? '').trim();

      if (!courier && !trackingNo) {
        results.push({ at, ok: false, skipped: true, reason: '채울 배송 정보가 없습니다.' });
        continue;
      }

      const candidates = (byOrderNo.get(orderNo) ?? []).filter((c) => !used.has(c.id));
      if (candidates.length === 0) {
        // 우리 신청이 아니거나 이 표의 다른 줄이 이미 가져갔다. 오류가 아니다.
        results.push({ at, ok: false, skipped: true, reason: '우리 신청에 없는 주문번호입니다.' });
        continue;
      }

      // 사은품명이 같은 것을 먼저. 없으면 남은 것 중 첫 번째.
      const target =
        candidates.find((c) => (c.gift_name ?? '').trim() === giftName) ?? candidates[0];
      used.add(target.id);

      const { data, error } = await supabase
        .from('gift_requests')
        .update({
          status: 'shipped',
          courier,
          tracking_no: trackingNo,
          // 안 적혀 온 칸은 건드리지 않는다. 빈 값으로 덮으면 있던 값이 사라진다.
          ...(orderDate ? { order_date: orderDate } : {}),
          ...(deliveryMemo ? { delivery_memo: deliveryMemo } : {}),
          shipped_by: user.username,
          shipped_at: now,
          // 바뀐 값은 지사가 다시 봐야 한다.
          ship_read_at: null,
          ship_read_by: null,
          updated_at: now,
        })
        .eq('id', target.id)
        .select(GIFT_COLUMNS)
        .single();

      if (error) {
        console.error('Gift ship paste update error:', error);
        results.push({ at, ok: false, reason: '저장하지 못했습니다.' });
        continue;
      }
      results.push({ at, ok: true, data });
    }

    /*
     * 발주는 나갔는데 송장이 안 들어온 건.
     *
     * 채운 것만 세면 "열네 건 보냈는데 열두 건만 왔다"를 아무도 모른다. 이번에
     * 손댄 발주 장을 다시 훑어 아직 'ordered'로 남은 건을 함께 돌려준다 —
     * 발주처에 다시 물어야 할 것이 바로 그 줄들이다.
     */
    const touchedOrders = [
      ...new Set(
        results
          .filter((r) => r.ok)
          .map((r) => (r.data as { order_id?: number | null } | undefined)?.order_id)
          .filter((id): id is number => !!id)
      ),
    ];
    let remaining: Array<Record<string, unknown>> = [];
    if (touchedOrders.length > 0) {
      const { data: left } = await supabase
        .from('gift_requests')
        .select('id, order_id, order_no, customer_name, gift_name, quantity, group_name')
        .in('order_id', touchedOrders)
        .eq('status', 'ordered')
        .order('order_id', { ascending: true })
        .order('id', { ascending: true });
      remaining = (left ?? []) as unknown as Array<Record<string, unknown>>;
    }

    return NextResponse.json(
      {
        results,
        filled: results.filter((r) => r.ok).length,
        skipped: results.filter((r) => r.skipped).length,
        failed: results.filter((r) => !r.ok && !r.skipped).length,
        remaining,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Gift ship paste error:', error);
    return NextResponse.json({ error: '배송 정보를 채우지 못했습니다.' }, { status: 500 });
  }
}
