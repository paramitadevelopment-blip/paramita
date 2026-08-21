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

    // 2. 총 소속 수는 아래 소속별 통계를 접고 나서 그 개수로 센다.
    //    여기서 행을 그대로 세면 파라인슈1·파라인슈2가 둘로 잡혀
    //    바로 아래 표(파라인슈 한 줄)와 숫자가 어긋난다.

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
      .select('id, name, group_name')
      .eq('is_admin', false)
      .order('group_name', { ascending: true });

    // 사용자 소속은 조직 단위('파라인슈')로 저장된다. 배정 분류('파라인슈1')별로 세면
    // 어느 쪽도 사람이 잡히지 않아 0명짜리 줄만 늘어난다. 조직 단위로 접어서 센다.
    const groups: { id: number; name: string }[] = [];
    for (const dept of departments || []) {
      if (!groups.some((g) => g.name === dept.group_name)) {
        groups.push({ id: dept.id, name: dept.group_name });
      }
    }

    // 소속 이름 → 그 조직에 속한 부서 id들. 파라인슈처럼 쪼개진 조직은 id가 여럿이라
    // 파일 수를 셀 때 하나만 보면 나머지 분류의 파일이 빠진다.
    const deptIdsByGroup: Record<string, number[]> = {};
    for (const dept of departments || []) {
      (deptIdsByGroup[dept.group_name] ??= []).push(dept.id);
    }

    const departmentStats = await Promise.all(
      groups.map(async (group) => {
        const deptIds = deptIdsByGroup[group.name] || [];

        const [{ count: userCount }, { count: fileCount }] = await Promise.all([
          supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('department', group.name),
          // 배포본만 센다. 원본은 아직 어느 소속의 것도 아니다.
          supabase
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('is_original', false)
            .in('department_id', deptIds),
        ]);

        return {
          id: group.id,
          name: group.name,
          userCount: userCount || 0,
          fileCount: fileCount || 0,
        };
      })
    );

    // 관리자가 올린 원본 파일 수. 배포본은 여기서 파생된 사본이라 따로 세지 않는다.
    const { count: uploadedFiles } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('is_original', true);

    return NextResponse.json({
      summary: {
        totalUsers: totalUsers || 0,
        totalDepartments: departmentStats.length,
        todayUsers: todayUsers || 0,
        uploadedFiles: uploadedFiles || 0,
      },
      recentUsers: recentUsers || [],
      // 최근 업로드 목록은 화면이 /api/files/list로 따로 받아 쓴다. 여기서 또 내리면
      // 같은 값을 두 곳에서 관리하게 되므로 비워 둔다.
      recentFiles: [],
      departmentStats: departmentStats || [],
    });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
