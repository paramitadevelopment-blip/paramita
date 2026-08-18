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

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can access this' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('download_records')
      .select('id');

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
