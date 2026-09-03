import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { canAssignComplaintAgent, canViewAllComplaints } from '@/lib/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 민원을 넘길 수 있는 설계사 목록.
 *
 * 사용자 관리 API는 관리자만 쓸 수 있어서 지사가 자기 설계사를 고를 수 없다.
 * 그렇다고 그 API를 지사에게 열면 전 직원 명부가 함께 열린다 — 여기서는
 * **자기 소속 설계사의 이름만** 준다.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canAssignComplaintAgent(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let group: string | null = null;

    if (canViewAllComplaints(user.role)) {
      // 관리자는 어느 지사의 설계사든 골라야 한다 — 대신 지사를 지정해야 한다.
      group = (new URL(request.url).searchParams.get('group') || '').trim() || null;
      if (!group) return NextResponse.json({ data: [] });
    } else {
      const { data: me } = await supabase
        .from('users')
        .select('department')
        .eq('id', user.id)
        .single();
      group = me?.department ?? null;
      if (!group) {
        return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from('users')
      // 고르는 데 필요한 값만 준다. 사번·생성일 같은 건 이 화면과 무관하다.
      .select('id, name, username')
      .eq('role', 'agent')
      .eq('department', group)
      .order('name', { ascending: true });

    if (error) {
      console.error('Agents query error:', error);
      return NextResponse.json({ error: '설계사 목록을 불러올 수 없습니다.' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('Agents API error:', error);
    return NextResponse.json({ error: '설계사 목록을 불러올 수 없습니다.' }, { status: 500 });
  }
}
