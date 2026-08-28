import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { createClient } from '@supabase/supabase-js';
import { parsePagination } from '@/lib/pagination';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 로그인 기록 조회.
 *
 * 누가 언제 어디서 들어왔는지, 그리고 누가 실패했는지를 본다.
 * 다른 사람의 접속 이력이라 관리자만 볼 수 있다.
 */

/*
 * 정렬할 수 있는 것들. 사용자가 보내는 값이라 흰 목록으로만 받는다.
 *
 * 기기는 화면에 `OS · 브라우저`로 붙여 보여주므로 정렬도 그 두 열을 순서대로
 * 건다. 한 열만 걸면 같은 Windows 안에서 브라우저가 뒤섞여 보인다.
 */
const SORT_COLUMNS: Record<string, string[]> = {
  logged_in_at: ['logged_in_at'],
  username: ['username'],
  user_name: ['user_name'],
  user_department: ['user_department'],
  ip_address: ['ip_address'],
  success: ['success'],
  device: ['os_name', 'browser_name'],
};

const LIST_COLUMNS =
  'id, user_id, username, user_name, user_department, user_role, ' +
  'success, fail_reason, ip_address, device_type, os_name, browser_name, logged_in_at';

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 남의 접속 이력이라 관리자 전용이다. 사이드바에서 링크를 숨기는 건
    // UX일 뿐이고, 실제 차단은 여기서 한다.
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can view login records' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const search = (searchParams.get('search') || '').trim();
    const sortByParam = searchParams.get('sortBy') || 'logged_in_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc';
    const sortBy = sortByParam in SORT_COLUMNS ? sortByParam : 'logged_in_at';

    /*
     * 성공·실패를 갈라 볼 수 있게 한다.
     *
     *   all(기본) 전부 · success 성공만 · failed 실패만
     *
     * 실패만 모아 보는 게 이 화면의 쓰임새다 — 누가 계속 틀리고 있는지가
     * 성공 기록 사이에 섞여 있으면 눈에 안 들어온다.
     */
    const status = searchParams.get('status') ?? 'all';

    let query = supabase.from('login_records').select(LIST_COLUMNS, { count: 'exact' });

    if (status === 'success') query = query.eq('success', true);
    else if (status === 'failed') query = query.eq('success', false);

    if (search) {
      query = query.or(
        [
          `username.ilike.%${search}%`,
          `user_name.ilike.%${search}%`,
          `user_department.ilike.%${search}%`,
          `ip_address.ilike.%${search}%`,
        ].join(',')
      );
    }

    // 값이 없는 행(기기를 못 읽은 건)은 어느 방향이든 뒤로 보낸다.
    // 그냥 두면 내림차순일 때 빈 칸이 맨 위에 몰려 첫 화면이 비어 보인다.
    for (const column of SORT_COLUMNS[sortBy]) {
      query = query.order(column, { ascending: sortOrder, nullsFirst: false });
    }

    // 동점이면 순서가 고정되지 않아 페이지를 넘길 때 행이 중복되거나 빠진다.
    const { data, error, count } = await query
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Login records query error:', error);
      return NextResponse.json({ error: '기록을 불러올 수 없습니다.' }, { status: 500 });
    }

    const totalRecords = count ?? 0;

    return NextResponse.json({
      data: data ?? [],
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
      },
    });
  } catch (error) {
    console.error('Login records API error:', error);
    return NextResponse.json({ error: '기록을 불러올 수 없습니다.' }, { status: 500 });
  }
}
