import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/fetchAllRows';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ error: 'Only admin can view download history' }, { status: 403 });
    }

    // 전체 삭제용 id 목록이다. 상한에 잘리면 그만큼만 지워져 "전체 삭제"가 전체가 아니게 된다.
    const { data, error } = await fetchAllRows<{ id: number }>(() =>
      supabase.from('download_records').select('id', { count: 'exact' })
    );

    if (error) {
      console.error('Failed to fetch all records:', error);
      return NextResponse.json({
        success: false,
        records: [],
      }, { status: 200 });
    }

    return NextResponse.json({
      success: true,
      records: data || [],
    });
  } catch (error) {
    console.error('All records error:', error);
    return NextResponse.json({
      success: false,
      records: [],
    }, { status: 200 });
  }
}
