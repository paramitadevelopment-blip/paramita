import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get('employee_id');
    const excludeUserId = searchParams.get('exclude_user_id');

    if (!employeeId) {
      return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 });
    }

    // 데이터베이스에서 확인
    let query = supabase
      .from('users')
      .select('id')
      .eq('employee_id', employeeId);

    if (excludeUserId) {
      query = query.neq('id', parseInt(excludeUserId));
    }

    const { data: existingUser, error } = await query.single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // PGRST116 = no rows returned (사용 가능한 사번)
    const available = !existingUser;

    return NextResponse.json({
      available,
      employee_id: employeeId,
    });
  } catch (error) {
    console.error('Employee ID check error:', error);
    return NextResponse.json({ error: 'Failed to check employee ID' }, { status: 500 });
  }
}
