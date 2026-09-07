import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { canForwardGiftRequests, canViewAllGiftRequests } from '@/lib/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const FORWARD_LIMIT = 200;

/**
 * 지사가 소속 설계사의 신청을 골라 사은품담당자에게 전달한다.
 *
 * 여러 건을 한 번에 받는다 — 지사는 며칠치를 모아 한 번에 보낸다. 한 건씩
 * 보내면 그만큼 왕복이 생기고, 중간에 끊기면 어디까지 갔는지 알 수 없다.
 *
 * 전달할 수 있는 것만 넘어간다: 내 소속의, 아직 전달 전(requested)인 건.
 * 남의 소속 것이나 이미 전달된 것이 섞여 있으면 그 줄만 빠지고 나머지는 간다.
 * 응답에 몇 건이 갔고 몇 건이 빠졌는지가 온다.
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
    if (!canForwardGiftRequests(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const ids = Array.isArray(body?.ids)
      ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: '전달할 신청을 골라 주세요.' }, { status: 400 });
    }
    if (ids.length > FORWARD_LIMIT) {
      return NextResponse.json(
        { error: `한 번에 ${FORWARD_LIMIT}건까지 전달할 수 있습니다.` },
        { status: 400 }
      );
    }

    let query = supabase
      .from('gift_requests')
      .update({
        status: 'forwarded',
        forwarded_by: user.username,
        forwarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', ids)
      // 전달 전인 것만. 이미 간 것을 다시 보내면 전달 시각이 덮인다.
      .eq('status', 'requested');

    // 지사는 자기 소속 것만. 요청에 남의 id를 섞어 보내도 여기서 빠진다.
    if (!canViewAllGiftRequests(user.role)) {
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

    const { data, error } = await query.select('id');
    if (error) {
      console.error('Gift forward error:', error);
      return NextResponse.json({ error: '전달하지 못했습니다.' }, { status: 500 });
    }

    const forwarded = data?.length ?? 0;
    return NextResponse.json({ forwarded, skipped: ids.length - forwarded });
  } catch (error) {
    console.error('Gift forward API error:', error);
    return NextResponse.json({ error: '전달하지 못했습니다.' }, { status: 500 });
  }
}
