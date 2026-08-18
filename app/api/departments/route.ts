import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('departments')
      .select('*')
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

    const { data, error } = await supabase
      .from('departments')
      .insert([{ name: name.trim() }])
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
      .select('name')
      .eq('id', id)
      .single();

    if (deptError || !deptToDelete) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    // checkOnly면 소속을 옮겨야 하는 대상 수만 반환한다.
    // 파일도 소속을 참조하므로 사용자가 없어도 대상이 될 수 있다.
    if (checkOnly) {
      const [{ count: userCount }, { count: fileCount }] = await Promise.all([
        supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('department', deptToDelete.name),
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
