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

    // Admin 권한 확인
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can access dashboard' }, { status: 403 });
    }

    // 1. 총 사용자 수
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // 2. 총 소속 수 (관리자 제외)
    const { count: totalDepartments } = await supabase
      .from('departments')
      .select('*', { count: 'exact', head: true })
      .neq('name', '관리자');

    // 3. 오늘 추가된 사용자 수
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = today.toISOString();

    const { count: todayUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayString);

    // 4. 최근 추가된 사용자 5명
    const { data: recentUsers } = await supabase
      .from('users')
      .select('id, username, name, employee_id, department, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    // 5. 소속별 사용자 수 및 파일 업로드 수 (관리자 제외)
    // 참고: 파일 테이블이 없으므로 임시로 0으로 반환 (나중에 파일 테이블 추가 시 수정)
    const { data: departments } = await supabase
      .from('departments')
      .select('id, name')
      .neq('name', '관리자')
      .order('name', { ascending: true });

    const departmentStats = await Promise.all(
      (departments || []).map(async (dept) => {
        const { count: userCount } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('department', dept.name);

        return {
          id: dept.id,
          name: dept.name,
          userCount: userCount || 0,
          fileCount: 0, // TODO: 파일 테이블 추가 후 구현
        };
      })
    );

    return NextResponse.json({
      summary: {
        totalUsers: totalUsers || 0,
        totalDepartments: totalDepartments || 0,
        todayUsers: todayUsers || 0,
        uploadedFiles: 0, // TODO: 파일 테이블 추가 후 구현
      },
      recentUsers: recentUsers || [],
      recentFiles: [], // TODO: 파일 테이블 추가 후 구현
      departmentStats: departmentStats || [],
    });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
