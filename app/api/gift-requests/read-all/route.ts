import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { canManageGiftRequests, canRequestGift, canViewAllGiftRequests } from '@/lib/roles';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LIMIT = 1000;

/** 이 사용자의 소속. 토큰에 없으므로 그때그때 읽는다. */
async function departmentOf(userId: number): Promise<string | null> {
  const { data } = await supabase.from('users').select('department').eq('id', userId).single();
  return data?.department ?? null;
}

/**
 * 여러 신청을 한 번에 확인 처리한다.
 *
 * 건별로 부르면 서른 건이면 서른 번 오간다. 한 번의 UPDATE로 끝낸다.
 * 아직 안 본 것만 찍으므로 처음 본 시각은 덮이지 않는다.
 *
 * 두 자리가 있다. 확인하는 사람도 보는 것도 다르지만 하는 일은 같다.
 *   manage  담당자가 발주 대기 건을 확인한다. 고른 것(ids)만
 *   ship    지사가 송장이 채워진 자기 건을 확인한다. 소속 것 전부 —
 *           지사는 자기 것만 보므로 고르고 말고 할 것이 없다
 */
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    const body = await request.json();
    const now = new Date().toISOString();

    /* ── 지사: 송장을 봤다 ─────────────────────────────────── */
    if (body?.kind === 'ship') {
      if (!canRequestGift(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      /*
       * 관리자는 찍지 않는다. 송장을 기다린 쪽은 신청한 지사이고, 관리자가
       * 대신 눌러 버리면 지사의 배지가 아무도 안 본 채로 내려간다.
       */
      const department = canViewAllGiftRequests(user) ? null : await departmentOf(user.id);
      if (!department) {
        return NextResponse.json(
          { error: '배송 정보 확인은 신청한 지사가 합니다.' },
          { status: 403 }
        );
      }
      const { data, error } = await supabase
        .from('gift_requests')
        .update({ ship_read_at: now, ship_read_by: user.username, updated_at: now })
        .eq('group_name', department)
        .eq('status', 'shipped')
        .is('ship_read_at', null)
        .select('id');
      if (error) throw error;
      return NextResponse.json({ read: data?.length ?? 0 });
    }

    /* ── 담당자: 발주 대기 건을 봤다 ───────────────────────── */
    if (!canManageGiftRequests(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, LIMIT)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: '확인할 신청을 골라 주세요.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('gift_requests')
      .update({ read_at: now, read_by: user.username, updated_at: now })
      .in('id', ids)
      .eq('status', 'forwarded')
      .is('read_at', null)
      .select('id');
    if (error) throw error;
    return NextResponse.json({ read: data?.length ?? 0 });
  } catch (error) {
    console.error('Gift bulk read error:', error);
    return NextResponse.json({ error: '확인 처리하지 못했습니다.' }, { status: 500 });
  }
}
