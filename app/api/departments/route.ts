import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { getUndeletableReason, isHiddenDepartment } from '@/lib/departments';
import { isAdminRole } from '@/lib/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 소속 목록 조회는 사용자 관리뿐 아니라 파일 업로드(분류·배포)·소속 필터
    // 등 관리자급 화면 전반에서 쓴다. 서브관리자는 사용자 관리만 못 할 뿐
    // 나머지는 관리자와 동일해야 하므로 조회는 막지 않는다. 생성·삭제(소속
    // 관리 자체)는 사용자 관리 화면에 속하니 admin 전용으로 아래에 남긴다.
    if (!isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Only admin can view departments' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('departments')
      .select('id, name, group_name, is_admin, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Departments fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // CSRF 토큰 검증
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    // Admin만 소속 생성 가능
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can create departments' }, { status: 403 });
    }

    const { name } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Department name is required' }, { status: 400 });
    }

    // 길이 검증
    if (name.trim().length < 2 || name.trim().length > 50) {
      return NextResponse.json({ error: 'Department name must be 2-50 characters' }, { status: 400 });
    }

    // 특수문자 제한 (한글, 영문, 숫자, 공백, 하이픈만 허용)
    if (!/^[가-힣a-zA-Z0-9\s\-]+$/.test(name.trim())) {
      return NextResponse.json({ error: 'Department name can only contain letters, numbers, spaces, and hyphens' }, { status: 400 });
    }

    // 새로 만드는 소속은 자기 자신이 그룹이다. 여러 분류를 한 조직으로 묶는 건
    // 배정 규칙이 그 조직을 쪼갤 때만 생기는 일이라, 그때 group_name을 손대면 된다.
    const { data, error } = await supabase
      .from('departments')
      .insert([{ name: name.trim(), group_name: name.trim() }])
      .select();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    console.error('Department creation error:', error);
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 존재하는 소속입니다.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // CSRF 토큰 검증 (checkOnly가 아닐 때만)
    const { searchParams } = new URL(request.url);
    const checkOnly = searchParams.get('checkOnly') === 'true';
    if (!checkOnly && !verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    // Admin만 소속 삭제 가능
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can delete departments' }, { status: 403 });
    }

    const id = searchParams.get('id');
    const newDepartmentName = searchParams.get('newDepartmentName');

    if (!id) {
      return NextResponse.json({ error: 'Department ID is required' }, { status: 400 });
    }

    // ID 유효성 검증
    const deptId = Number(id);
    if (!Number.isInteger(deptId) || deptId <= 0) {
      return NextResponse.json({ error: 'Invalid department ID' }, { status: 400 });
    }

    // 삭제할 소속 정보 조회
    const { data: deptToDelete, error: deptError } = await supabase
      .from('departments')
      .select('name, group_name, is_admin')
      .eq('id', id)
      .single();

    if (deptError || !deptToDelete) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    // 관리자 소속은 업로드한 원본이 들어가는 자리다. 지우면 그 순간부터
    // 모든 업로드가 실패한다. 목록에서 숨기는 것만으로는 API를 막지 못한다.
    if (deptToDelete.is_admin) {
      return NextResponse.json(
        { error: '관리자 소속은 삭제할 수 없습니다. 업로드한 원본 파일이 이 소속에 들어갑니다.' },
        { status: 400 }
      );
    }

    // '담당자' 소속도 같은 이유로 막는다. is_admin과 달리 전용 플래그가 없어
    // 이름으로 본다 — 목록에서 숨기는 것만으로는 API를 직접 부르는 걸 막지 못한다.
    if (isHiddenDepartment(deptToDelete.name)) {
      return NextResponse.json(
        { error: `'${deptToDelete.name}' 소속은 삭제할 수 없습니다. 그 역할의 계정이 이 소속에 속합니다.` },
        { status: 400 }
      );
    }

    // 쪼개진 조직의 하위 분류(파라인슈1·파라인슈2)는 혼자 지울 수 없다.
    // 사용자는 조직에 속하고 파일은 분류에 속해서, 하나만 지우면 사용자는
    // 그대로인데 파일만 갈 곳을 잃는다. 화면에서 버튼을 감추는 것만으로는
    // API를 직접 부르는 걸 막지 못한다.
    const { data: allDepts } = await supabase
      .from('departments')
      .select('id, name, group_name');

    const undeletable = getUndeletableReason(allDepts ?? undefined, deptToDelete.name);
    if (undeletable) {
      return NextResponse.json({ error: undeletable }, { status: 400 });
    }

    // checkOnly면 소속을 옮겨야 하는 대상 수만 반환한다.
    // 파일도 소속을 참조하므로 사용자가 없어도 대상이 될 수 있다.
    if (checkOnly) {
      // 사용자 소속은 조직 단위('파라인슈')다. 분류명('파라인슈1')으로 세면 늘 0이 나온다.
      // 같은 조직에 다른 분류가 남으면 사용자는 갈 곳이 있으니 영향이 없고,
      // 마지막 하나를 지울 때만 옮겨야 한다. 아래 RPC도 같은 규칙을 쓴다.
      const { count: siblingCount } = await supabase
        .from('departments')
        .select('*', { count: 'exact', head: true })
        .eq('group_name', deptToDelete.group_name)
        .neq('id', deptId);

      const isLastOfGroup = (siblingCount || 0) === 0;

      const [{ count: userCount }, { count: fileCount }] = await Promise.all([
        isLastOfGroup
          ? supabase
              .from('users')
              .select('*', { count: 'exact', head: true })
              .eq('department', deptToDelete.group_name)
          : Promise.resolve({ count: 0 }),
        supabase
          .from('files')
          .select('*', { count: 'exact', head: true })
          .eq('department_id', deptId),
      ]);

      return NextResponse.json(
        { userCount: userCount || 0, fileCount: fileCount || 0 },
        { status: 200 }
      );
    }

    // 소속 변경과 삭제는 반드시 한 트랜잭션에서 처리한다.
    // 나눠서 실행하면 변경만 되고 삭제가 실패하는 부분 실패가 발생한다.
    const { data: result, error: rpcError } = await supabase.rpc('delete_department_with_migration', {
      p_dept_id: deptId,
      p_new_dept_name: newDepartmentName?.trim() || null,
      p_actor: user.username,
    });

    if (rpcError) {
      const message = rpcError.message || '';

      if (message.includes('DEPARTMENT_NOT_FOUND')) {
        return NextResponse.json({ error: 'Department not found' }, { status: 404 });
      }
      if (message.includes('NEW_DEPARTMENT_REQUIRED')) {
        return NextResponse.json({ error: '변경할 소속을 지정해야 합니다.' }, { status: 400 });
      }
      if (message.includes('NEW_DEPARTMENT_NOT_FOUND')) {
        return NextResponse.json({ error: '변경할 소속이 존재하지 않습니다.' }, { status: 400 });
      }
      if (message.includes('SAME_DEPARTMENT')) {
        return NextResponse.json({ error: '같은 소속으로는 변경할 수 없습니다.' }, { status: 400 });
      }

      console.error('Department deletion RPC error:', rpcError);
      return NextResponse.json({ error: 'Failed to delete department' }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Department deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete department' }, { status: 500 });
  }
}
