import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import {
  canManageGiftRequests,
  canViewAllGiftRequests,
  canViewGiftRequests,
  isAgentRole,
} from '@/lib/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 사이드바 배지. **지금 내가 손대야 할 건수**만 센다.
 *
 *   사은품 신청  설계사  보완 요청을 받아 돌아온 내 신청
 *                지사    소속에서 올라와 아직 전달하지 않은 것 + 보완 요청 받은 것
 *   사은품 관리  담당자  전달됐는데 아직 발주하지 않은 것
 *
 * 관리자급은 두 메뉴가 다 보이지만 배지는 담당자 몫(발주 대기)만 센다 —
 * 지사가 전달할 것까지 세면 관리자가 할 수 있는 일이 아닌 숫자가 뜬다.
 */
const base = () => supabase.from('gift_requests').select('id', { count: 'exact', head: true });

async function countOf(build: () => any): Promise<number> {
  const { count, error } = await build();
  if (error) {
    console.error('Gift badge count error:', error);
    return 0;
  }
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let requests = 0;
    let manage = 0;

    if (canViewAllGiftRequests(user.role)) {
      if (canManageGiftRequests(user.role)) {
        manage = await countOf(() => base().eq('status', 'forwarded'));
      }
    } else if (isAgentRole(user.role)) {
      requests = await countOf(() => base().eq('requester_id', user.id).eq('status', 'supplement'));
    } else if (canViewGiftRequests(user.role)) {
      const { data: me } = await supabase
        .from('users')
        .select('department')
        .eq('id', user.id)
        .single();
      if (me?.department) {
        requests = await countOf(() =>
          base().eq('group_name', me.department).in('status', ['requested', 'supplement'])
        );
      }
    }

    return NextResponse.json({ requests, manage });
  } catch (error) {
    console.error('Gift badge count error:', error);
    return NextResponse.json({ requests: 0, manage: 0 });
  }
}
