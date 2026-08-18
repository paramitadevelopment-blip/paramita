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

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can view users' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    let search = searchParams.get('search') || '';
    const department = searchParams.get('department');
    const page = parseInt(searchParams.get('page') || '1');
    const sortBy = searchParams.get('sortBy') || 'username';
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? false : true;
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
    const offset = (page - 1) * limit;

    // 입력값 검증 및 sanitization
    search = search.trim().slice(0, 100);
    if (!/^[\w\s\-\.가-힣]*$/.test(search)) {
      return NextResponse.json({ error: 'Invalid search query' }, { status: 400 });
    }

    // admin 조회 (검색 조건 포함)
    let adminData = null;
    const adminQuery = supabase
      .from('users')
      .select('id, username, name, department, role, employee_id, created_at')
      .eq('username', 'admin');

    if (search) {
      adminQuery.or(`username.ilike.%${search}%,name.ilike.%${search}%,department.ilike.%${search}%`);
    }

    if (department) {
      adminQuery.eq('department', department);
    }

    const adminResult = await adminQuery.single();
    adminData = adminResult.data;

    // 나머지 사용자 조회
    let query = supabase
      .from('users')
      .select('id, username, name, department, role, employee_id, created_at', { count: 'exact' })
      .neq('username', 'admin');

    // name, username 정렬은 클라이언트에서 처리하므로 API에서는 제외
    if (sortBy !== 'name' && sortBy !== 'username') {
      query = query
        .order(sortBy, { ascending: sortOrder })
        .order('id', { ascending: true });
    } else {
      // name, username 정렬 시 id로만 정렬
      query = query.order('id', { ascending: true });
    }

    if (search) {
      query = query.or(`username.ilike.%${search}%,name.ilike.%${search}%,department.ilike.%${search}%`);
    }

    if (department) {
      query = query.eq('department', department);
    }

    const { data: otherData, error, count } = await query.range(offset, offset + limit - 1);

    // admin을 맨 위에 놓고 나머지를 뒤에 붙이기
    const data = adminData ? [adminData, ...(otherData || [])] : otherData;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      data,
      pagination: { total: count, page, limit, pages: Math.ceil((count || 0) / limit) },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
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

    // Admin만 사용자 생성 가능
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can create users' }, { status: 403 });
    }

    const { username, password, name, department, employee_id } = await request.json();

    if (!username || !password || !name || !department) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 입력값 길이 및 형식 검증
    if (!username.trim()) {
      return NextResponse.json({ error: 'Username cannot be empty' }, { status: 400 });
    }

    if (username.trim().length < 3 || username.trim().length > 10) {
      return NextResponse.json({ error: 'Username must be 3-10 characters' }, { status: 400 });
    }

    // Username은 영문, 숫자, 언더스코어만 허용하고, 최소 하나의 영문이나 숫자 필요
    if (!/^(?=.*[a-zA-Z0-9])[a-zA-Z0-9_]+$/.test(username.trim())) {
      return NextResponse.json({ error: '아이디는 영문과 숫자를 포함해야 합니다.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    if (password.length > 10) {
      return NextResponse.json({ error: 'Password must be less than 10 characters' }, { status: 400 });
    }

    if (!name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    if (name.trim().length < 2 || name.trim().length > 10) {
      return NextResponse.json({ error: 'Name must be 2-10 characters' }, { status: 400 });
    }

    if (!department.trim()) {
      return NextResponse.json({ error: 'Department cannot be empty' }, { status: 400 });
    }

    if (department.trim().length > 50) {
      return NextResponse.json({ error: 'Department name must be less than 50 characters' }, { status: 400 });
    }

    // department 존재 확인
    const { data: deptExists, error: deptCheckError } = await supabase
      .from('departments')
      .select('id')
      .eq('name', department.trim())
      .single();

    if (deptCheckError || !deptExists) {
      return NextResponse.json({ error: '존재하지 않는 소속입니다.' }, { status: 400 });
    }

    const bcrypt = require('bcryptjs');
    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase.from('users').insert([
      { username, password_hash, name, department, role: 'user', employee_id },
    ]);

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '요청을 처리할 수 없습니다.' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: '요청을 처리할 수 없습니다.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // CSRF 토큰 검증
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { id, username, name, department, password, employee_id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // ID 유효성 검증
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Admin이 아니면 자신의 정보만 수정 가능
    if (user.role !== 'admin' && user.id !== userId) {
      return NextResponse.json({ error: 'Cannot modify other users' }, { status: 403 });
    }

    // 아이디(username) 변경 시도 방지
    if (username) {
      return NextResponse.json({ error: 'Cannot change username' }, { status: 403 });
    }

    // Admin 사용자 수정 방지
    const { data: targetUser, error: fetchError } = await supabase
      .from('users')
      .select('username, department')
      .eq('id', userId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.username === 'admin') {
      return NextResponse.json({ error: 'Cannot modify admin user' }, { status: 403 });
    }

    // 필수 필드 검증
    if (name && !name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    if (department && !department.trim()) {
      return NextResponse.json({ error: 'Department cannot be empty' }, { status: 400 });
    }

    // department 존재 확인 (수정하려는 경우)
    if (department) {
      const { data: deptExists, error: deptCheckError } = await supabase
        .from('departments')
        .select('id')
        .eq('name', department.trim())
        .single();

      if (deptCheckError || !deptExists) {
        return NextResponse.json({ error: '존재하지 않는 소속입니다.' }, { status: 400 });
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (department) updateData.department = department;
    if (employee_id !== undefined) updateData.employee_id = employee_id;

    if (password) {
      const bcrypt = require('bcryptjs');
      updateData.password_hash = await bcrypt.hash(password, 10);
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select();

    if (error) throw error;

    // 소속이 실제로 바뀐 경우에만 이력을 남긴다. 실패해도 수정 자체는 성공 처리한다.
    if (department && department.trim() !== targetUser.department) {
      const { error: logError } = await supabase.from('department_change_logs').insert({
        user_id: userId,
        from_department: targetUser.department,
        to_department: department.trim(),
        reason: 'manual_edit',
        changed_by: user.username,
      });

    }

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // CSRF 토큰 검증
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    // Admin만 삭제 가능
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can delete users' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids');

    // 여러 사용자 일괄 삭제
    if (ids) {
      const userIds = ids.split(',').map(id => parseInt(id, 10));

      // ID 유효성 검증
      if (userIds.length === 0 || userIds.length > 1000) {
        return NextResponse.json({ error: 'Invalid number of IDs' }, { status: 400 });
      }

      if (!userIds.every(id => Number.isInteger(id) && id > 0)) {
        return NextResponse.json({ error: 'Invalid user IDs' }, { status: 400 });
      }

      // 삭제할 사용자 정보 조회
      const { data: usersToDelete, error: getUsersError } = await supabase
        .from('users')
        .select('username')
        .in('id', userIds);

      if (getUsersError) throw getUsersError;

      // admin 포함 여부 확인
      if (usersToDelete?.some(u => u.username === 'admin')) {
        return NextResponse.json({ error: 'Cannot delete admin user' }, { status: 403 });
      }

      // 일괄 삭제
      const { error } = await supabase
        .from('users')
        .delete()
        .in('id', userIds);

      if (error) throw error;

      return NextResponse.json({ success: true, deletedCount: userIds.length });
    }

    // 단일 사용자 삭제
    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // ID 유효성 검증
    const deleteUserId = Number(id);
    if (!Number.isInteger(deleteUserId) || deleteUserId <= 0) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // 자신의 계정 삭제 방지
    if (user.id === deleteUserId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 403 });
    }

    // Admin 사용자 삭제 방지
    const { data: targetUser, error: fetchError } = await supabase
      .from('users')
      .select('username')
      .eq('id', deleteUserId)
      .single();

    if (fetchError) throw fetchError;

    if (targetUser?.username === 'admin') {
      return NextResponse.json({ error: 'Cannot delete admin user' }, { status: 403 });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', deleteUserId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
