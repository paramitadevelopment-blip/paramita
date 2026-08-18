import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');

    if (!userIdParam) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const userId = Number(userIdParam);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // 프론트에서 admin에게만 버튼을 노출하더라도 여기서 다시 막는다.
    // 일반 사용자는 본인 이력만 조회할 수 있다.
    if (user.role !== 'admin' && user.id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('department_change_logs')
      .select('id, from_department, to_department, reason, changed_by, changed_at')
      .eq('user_id', userId)
      .order('changed_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ records: data || [] });
  } catch (error) {
    console.error('Department logs fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch department logs' }, { status: 500 });
  }
}
