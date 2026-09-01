import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { isAssignableGroup, STAFF_DEPARTMENT, ADMIN_DEPARTMENT } from '@/lib/departments';
import { parsePagination } from '@/lib/pagination';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/** 사용자가 지워져 자동으로 거부될 때 남기는 사유 */
const DELETED_USER_REJECT_REASON = '사용자 삭제됨 (요청자 계정이 삭제되어 자동 거부)';

/**
 * 지우려는 사용자들의 대기 중인 재다운로드 요청을 자동으로 거부한다.
 *
 * 사용자를 지우면 요청의 user_id는 빈 값이 된다(기록은 남겨야 하므로 SET NULL).
 * 대기 상태로 남으면 관리자 승인 큐에 영원히 떠 있고, 승인해 봐야 권한은
 * user_id로 계산하므로 아무에게도 안 붙는다. 승인한 줄 알고 넘어가게 된다.
 *
 * 반드시 삭제 "전에" 불러야 한다. 지운 뒤에는 누구 요청이었는지 찾을 수 없다.
 */
async function rejectPendingRequestsOfDeletedUsers(userIds: number[], reviewer: { id: number; name?: string }) {
  const { data: reviewerRow } = await supabase
    .from('users')
    .select('name')
    .eq('id', reviewer.id)
    .single();

  const { error } = await supabase
    .from('redownload_requests')
    .update({
      status: 'rejected',
      reviewed_by: reviewer.id,
      reviewed_by_name: reviewerRow?.name || reviewer.name || null,
      reviewed_at: new Date().toISOString(),
      review_reason: DELETED_USER_REJECT_REASON,
    })
    .in('user_id', userIds)
    .eq('status', 'pending');

  // 여기서 실패해도 삭제 자체는 막지 않는다. 큐에 남은 건은 관리자가 손으로 처리할 수 있지만,
  // 삭제가 반쯤 되다 마는 것이 더 나쁘다.
  if (error) console.error('Failed to auto-reject pending redownload requests:', error);
}

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
    // page=abc면 NaN이 되어 range(NaN, NaN)으로 나가고, page=-5면 음수 범위가 나간다.
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const sortByParam = searchParams.get('sortBy') || 'username';
    const sortOrder = searchParams.get('sortOrder') === 'desc' ? false : true;

    // sortBy를 그대로 .order()에 넘기면 클라이언트가 정렬 대상을 마음대로 고른다.
    // password_hash 같은 컬럼으로 정렬시키면 순서만으로 값을 좁혀갈 수 있다.
    const SORTABLE = [
      'username',
      'name',
      'department',
      'employee_id',
      'created_at',
      'role',
    ];
    const sortBy = SORTABLE.includes(sortByParam) ? sortByParam : 'username';

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

    const { username, password, name, department: requestedDepartment, employee_id, role: requestedRole } = await request.json();

    if (!username || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    /*
     * 이 화면으로는 지사·서브관리자·DB담당자까지만 만들 수 있다. 관리자는 여기로 못 만든다 —
     * 요청자가 이미 admin인 것과 별개로, 이 엔드포인트 자체가 admin을 찍어낼
     * 수단이 되면 안 된다. 값을 안 보내면 기존과 같이 지사로 만든다.
     */
    const ASSIGNABLE_ROLES = ['user', 'staff', 'subadmin'];
    const role = requestedRole ?? 'user';
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json({ error: '지정할 수 없는 역할입니다.' }, { status: 400 });
    }

    /*
     * DB담당자의 소속은 'DB담당자', 서브관리자의 소속은 '관리자'로 고정한다.
     * 관리자 계정 소속이 '관리자'인 것과 같은 자리다 — 화면에서 고를 필요도 없고,
     * 요청으로 다른 값을 보내도 무시한다. 지사는 소속이 없으면 어느 지사 사람인지
     * 알 방법이 없어 그대로 필수다.
     */
    const department =
      role === 'staff'
        ? STAFF_DEPARTMENT
        : role === 'subadmin'
          ? ADMIN_DEPARTMENT
          : requestedDepartment;

    if (role !== 'staff' && role !== 'subadmin' && !department) {
      return NextResponse.json({ error: 'Department cannot be empty' }, { status: 400 });
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

    // DB담당자, 서브관리자는 서버가 직접 채운 고정값이라 이 검사를 안 거친다
    if (role !== 'staff' && role !== 'subadmin') {
      if (!department.trim()) {
        return NextResponse.json({ error: 'Department cannot be empty' }, { status: 400 });
      }

      if (department.trim().length > 50) {
        return NextResponse.json({ error: 'Department name must be less than 50 characters' }, { status: 400 });
      }

      // 화면에서 고를 수 없게 해둔 소속이 요청으로 직접 올 수 있다. 여기서도 막는다.
      if (!isAssignableGroup(department.trim())) {
        return NextResponse.json(
          { error: '해당 소속은 사용자에게 배정할 수 없습니다.' },
          { status: 400 }
        );
      }

      // department 존재 확인.
      // 사용자가 속하는 건 조직('파라인슈')이지 배정 분류('파라인슈1')가 아니다.
      // 한 조직이 여러 분류로 나뉘면 group_name이 여러 행에 걸리므로 개수로 본다.
      const { count: deptCount } = await supabase
        .from('departments')
        .select('id', { count: 'exact', head: true })
        .eq('group_name', department.trim());

      if (!deptCount) {
        return NextResponse.json({ error: '존재하지 않는 소속입니다.' }, { status: 400 });
      }
    }

    const bcrypt = require('bcryptjs');
    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase.from('users').insert([
      { username, password_hash, name, department, role, employee_id },
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

    const { id, username, name, department, password, employee_id, role } = await request.json();

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
      .select('username, department, role')
      .eq('id', userId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.username === 'admin') {
      return NextResponse.json({ error: 'Cannot modify admin user' }, { status: 403 });
    }

    /*
     * 역할은 본인이 스스로 못 바꾼다.
     *
     * 위의 "본인 수정 허용"은 이름·소속·비밀번호 같은 자기 정보에 대한 것이다.
     * 역할까지 여기 얹으면 지사·DB담당자 계정이 자기 요청에 role을 실어 보내
     * 스스로 권한을 올릴 수 있다. admin만 남의 역할을 바꿀 수 있게 한다.
     */
    if (role !== undefined) {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Only admin can change role' }, { status: 403 });
      }
      if (!['user', 'staff', 'subadmin'].includes(role)) {
        return NextResponse.json({ error: '지정할 수 없는 역할입니다.' }, { status: 400 });
      }
    }

    // 필수 필드 검증
    if (name && !name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    /*
     * 이번 요청이 끝난 뒤의 역할. role을 안 보냈으면 지금 역할 그대로다.
     * DB담당자로 (바뀌거나 이미 DB담당자로) 남으면 소속은 'DB담당자'로 고정한다.
     * 서브관리자로 남으면 소속은 '관리자'로 고정한다.
     */
    const nextRole = role !== undefined ? role : targetUser.role;
    let resolvedDepartment: string | undefined = department;

    if (nextRole === 'staff') {
      resolvedDepartment = STAFF_DEPARTMENT;
    } else if (nextRole === 'subadmin') {
      resolvedDepartment = ADMIN_DEPARTMENT;
    } else if ((targetUser.role === 'staff' || targetUser.role === 'subadmin') && !department) {
      return NextResponse.json({ error: '소속을 선택해주세요.' }, { status: 400 });
    }

    // department 존재 확인 (수정하려는 경우). 생성 때와 같은 기준으로 본다.
    if (resolvedDepartment && nextRole !== 'staff' && nextRole !== 'subadmin') {
      if (!resolvedDepartment.trim()) {
        return NextResponse.json({ error: 'Department cannot be empty' }, { status: 400 });
      }

      if (!isAssignableGroup(resolvedDepartment.trim())) {
        return NextResponse.json(
          { error: '해당 소속은 사용자에게 배정할 수 없습니다.' },
          { status: 400 }
        );
      }

      const { count: deptCount } = await supabase
        .from('departments')
        .select('id', { count: 'exact', head: true })
        .eq('group_name', resolvedDepartment.trim());

      if (!deptCount) {
        return NextResponse.json({ error: '존재하지 않는 소속입니다.' }, { status: 400 });
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (resolvedDepartment) updateData.department = resolvedDepartment;
    if (employee_id !== undefined) updateData.employee_id = employee_id;
    if (role !== undefined) updateData.role = role;

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
    // 실제로 쓴 값(resolvedDepartment)을 남긴다 — DB담당자로 바뀌면 요청에 실린
    // department는 무시되고 'DB담당자'가 들어가는데, 이력에는 요청 값이 아니라
    // 실제로 적용된 값이 남아야 나중에 대조할 수 있다.
    if (resolvedDepartment && resolvedDepartment.trim() !== targetUser.department) {
      const { error: logError } = await supabase.from('department_change_logs').insert({
        user_id: userId,
        from_department: targetUser.department,
        to_department: resolvedDepartment.trim(),
        reason: 'manual_edit',
        changed_by: user.username,
      });

      if (logError) console.error('Failed to record department change log:', logError);
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

      // 지우기 전에 대기 중인 재다운로드 요청을 정리한다. 지운 뒤에는 찾을 수 없다.
      await rejectPendingRequestsOfDeletedUsers(userIds, user);

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

    // 지우기 전에 대기 중인 재다운로드 요청을 정리한다. 지운 뒤에는 찾을 수 없다.
    await rejectPendingRequestsOfDeletedUsers([deleteUserId], user);

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
