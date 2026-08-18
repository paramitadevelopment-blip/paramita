import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    // 계정 존재 여부를 알려주는 엔드포인트이므로 인증이 없으면
    // 누구나 사용자명을 열거할 수 있다. 사용자 생성 권한자만 허용한다.
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // 입력값 검증
    if (username.length < 3 || username.length > 10) {
      return NextResponse.json({ available: false, reason: 'invalid_length' }, { status: 200 });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ available: false, reason: 'invalid_format' }, { status: 200 });
    }

    // 데이터베이스에서 확인
    const { data: existingUser, error } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // PGRST116 = no rows returned (사용 가능한 아이디)
    const available = !existingUser;

    return NextResponse.json({
      available,
      username,
    });
  } catch (error) {
    console.error('Username check error:', error);
    return NextResponse.json({ error: 'Failed to check username' }, { status: 500 });
  }
}
