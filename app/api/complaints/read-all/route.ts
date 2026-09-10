import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { canHandleComplaint, canViewAllComplaints } from '@/lib/roles';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** 한 번에 확인할 수 있는 최대 건수. 화면의 [전체 확인]이 긁어 오는 양을 덮는다. */
const LIMIT = 1000;

/**
 * 여러 민원을 한 번에 확인 처리한다.
 *
 * 건별로 부르면 서른 건이면 서른 번 오간다 — 사람이 기다린다. 한 번의 UPDATE로
 * 끝낸다. 아직 안 본 것만 찍으므로 처음 본 시각은 덮이지 않는다.
 *
 * 지사는 자기 소속만 찍는다. 화면에서 아이디를 만들어 보내지만 그 목록을 그대로
 * 믿지 않는다 — 조건을 여기서 다시 건다.
 */
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
    if (!canHandleComplaint(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const ids: number[] = Array.isArray(body?.ids)
      ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0).slice(0, LIMIT)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: '확인할 민원을 선택해 주세요.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    let query = supabase
      .from('complaints')
      .update({ read_at: now, read_by_id: user.id, read_by: user.username, updated_at: now })
      .in('id', ids)
      // 지사에 와 있고 아직 안 본 것만. 끝난 건과 이미 본 건은 건드리지 않는다.
      .eq('status', 'branch')
      .is('read_at', null);

    if (!canViewAllComplaints(user.role)) {
      const { data: me } = await supabase
        .from('users')
        .select('department')
        .eq('id', user.id)
        .single();
      if (!me?.department) {
        return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
      }
      query = query.eq('assigned_group', me.department);
    }

    const { data, error } = await query.select('id');
    if (error) throw error;
    return NextResponse.json({ read: data?.length ?? 0 });
  } catch (error) {
    console.error('Complaint bulk read error:', error);
    return NextResponse.json({ error: '확인 처리하지 못했습니다.' }, { status: 500 });
  }
}
