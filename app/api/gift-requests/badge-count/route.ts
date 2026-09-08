import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import {
  canManageGiftRequests,
  canViewAllGiftRequests,
  canViewGiftRequests,
  isAdminRole,
  isAgentRole,
} from '@/lib/roles';
import type { GiftStatus } from '@/lib/gifts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 사이드바 배지. **지금 내가 손대야 할 건수**만 센다.
 *
 *   사은품 신청  설계사  보완 요청을 받아 돌아온 내 신청
 *                지사    보완 요청 받은 것 + 배송 정보가 채워졌는데 아직 안 본 것
 *                        (등록한 건은 곧바로 담당자 몫이라 세지 않는다)
 *                관리자  배포 기록 없이 들어와 확인을 기다리는 것(전 지사)
 *   사은품 관리  담당자  전달됐는데 아직 발주하지 않은 것
 *
 * 관리자급의 '사은품 신청' 배지는 관리자 확인 대기만 센다 — 지사가 전달할 것까지
 * 세면 관리자가 할 수 있는 일이 아닌 숫자가 뜬다. 지사에게는 확인 대기를 세지
 * 않는다. 그건 지사가 아니라 관리자가 손댈 차례다.
 *
 * `tabs`는 같은 숫자를 **어느 상태 탭에 있는지**로 쪼갠 것이다. 옆 메뉴에 5가
 * 떠 있는데 어느 탭을 눌러야 할지 모르면 배지가 할 일을 다 못 한 것이다.
 * 그래서 합(`requests`)과 쪼갠 값(`tabs`)은 언제나 같은 것을 센다.
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
    const tabs: Partial<Record<GiftStatus, number>> = {};

    if (canViewAllGiftRequests(user)) {
      if (canManageGiftRequests(user)) {
        manage = await countOf(() => base().eq('status', 'forwarded'));
      }
      if (isAdminRole(user.role)) {
        requests = await countOf(() => base().eq('status', 'pending_check'));
        tabs.pending_check = requests;
      }
    } else if (isAgentRole(user.role)) {
      requests = await countOf(() => base().eq('requester_id', user.id).eq('status', 'supplement'));
      tabs.supplement = requests;
    } else if (canViewGiftRequests(user.role)) {
      const { data: me } = await supabase
        .from('users')
        .select('department')
        .eq('id', user.id)
        .single();
      if (me?.department) {
        /*
         * 지사가 손댈 것: 보완 요청을 받은 것, 그리고 **채워진 배송 정보 중
         * 아직 안 본 것**. 뒤의 것이 곧 "송장 나왔습니다"라는 알림이다 —
         * 확인을 누르면 내려간다.
         */
        const mine = () => base().eq('group_name', me.department);
        const [todo, unreadShip] = await Promise.all([
          countOf(() => mine().eq('status', 'supplement')),
          countOf(() => mine().eq('status', 'shipped').is('ship_read_at', null)),
        ]);
        requests = todo + unreadShip;
        tabs.supplement = todo;
        // 배송 정보 입력됨 탭에는 그 상태 전부가 아니라 **안 본 것**만 배지로 뜬다.
        // 확인을 누른 건은 목록에 남되 배지에서는 내려간다.
        tabs.shipped = unreadShip;
      }
    }

    return NextResponse.json({ requests, manage, tabs });
  } catch (error) {
    console.error('Gift badge count error:', error);
    return NextResponse.json({ requests: 0, manage: 0 });
  }
}
