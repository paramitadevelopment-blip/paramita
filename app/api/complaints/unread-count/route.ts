import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import {
  canViewAllComplaints,
  canRegisterComplaints,
  canViewComplaints,
  isAgentRole,
} from '@/lib/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 사이드바 배지에 띄울 숫자.
 *
 * "안 읽은 민원 수"가 아니라 **지금 내가 손대야 할 건수**다. 그래서 메뉴마다
 * 따로 센다 — 관리자는 두 메뉴가 다 보이는데 한 숫자를 나눠 쓰면, 민원 등록에
 * 붙은 배지를 누르고 들어가도 거기엔 아무것도 없다.
 *
 *   민원 등록  내가 넣었다가 반려돼 돌아온 건 (역할과 무관하게 '내가 넣은 것'만)
 *   민원관리   관리자  담당 지사를 못 찾은 건 — 관리자가 지정해야 넘어간다
 *              지사    아직 처리가 안 끝난 내 소속 민원 전부
 *              설계사  같은 기준으로 내게 배정된 것만
 *
 * **'안 본 건'이 아니라 '처리가 안 끝난 건'을 센다.** 확인만 하고 손을 놓은 것이야말로
 * 배지에 남아 있어야 한다 — 열어 보면 숫자가 사라지면, 배지는 봤는지만 말할 뿐
 * 무엇이 굴러가지 않는지는 말하지 않게 된다.
 *
 * 밀린 건(3일 초과)을 따로 더하지 않는 것도 같은 이유다. 밀린 건은 지사가 처리할
 * 일이고, 처리 전 건수를 세면 그 안에 이미 들어 있다. 관리자에게 더해 봐야
 * 관리자가 할 수 있는 일이 아니다 — 목록의 '밀린 건만 보기'로 본다.
 */
async function departmentOf(userId: number): Promise<string | null> {
  const { data } = await supabase.from('users').select('department').eq('id', userId).single();
  return data?.department ?? null;
}

/** 못 세면 0. 배지 하나 때문에 화면이 비면 안 된다. */
async function countOf(build: () => any): Promise<number> {
  const { count, error } = await build();
  if (error) {
    console.error('Complaint badge count error:', error);
    return 0;
  }
  return count ?? 0;
}

const base = () => supabase.from('complaints').select('id', { count: 'exact', head: true });

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    /* ── 민원 등록: 고쳐서 다시 보내야 할 것 ───────────────────── */
    let register = 0;
    if (canRegisterComplaints(user.role)) {
      register = await countOf(() =>
        base().eq('created_by_id', user.id).eq('status', 'returned')
      );
    }

    /* ── 민원관리: 아직 안 끝난 것 ─────────────────────────────── */
    let manage = 0;

    if (canViewAllComplaints(user.role)) {
      // 관리자가 지사를 정해 주기 전까지 아무 데도 가지 못하는 건.
      manage = await countOf(() => base().eq('status', 'unassigned'));
    } else if (isAgentRole(user.role)) {
      manage = await countOf(() => base().eq('agent_id', user.id).eq('status', 'agent'));
    } else if (canViewComplaints(user.role)) {
      const department = await departmentOf(user.id);
      // 소속을 못 읽으면 셀 수 없다. 0으로 두고 넘어간다 — 배지는 안내일 뿐이다.
      if (department) {
        manage = await countOf(() =>
          base().eq('assigned_group', department).in('status', ['branch', 'agent'])
        );
      }
    }

    return NextResponse.json({ register, manage });
  } catch (error) {
    console.error('Complaint badge count error:', error);
    return NextResponse.json({ register: 0, manage: 0 });
  }
}
