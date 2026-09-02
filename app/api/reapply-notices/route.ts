import { NextRequest, NextResponse } from 'next/server';
import { canViewAllReapplyNotices } from '@/lib/roles';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import { parsePagination } from '@/lib/pagination';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 재신청 고객 알림.
 *
 * 30일 중복이나 블랙리스트로 배정에서 빠진 건을, 그 사람을 직전에 받았던
 * 지사에게 보여준다.
 *
 * 지사 사용자는 **자기 소속 것만** 본다. 화면에서 가리는 게 아니라 여기서
 * 조건을 건다 — 요청을 직접 만들면 남의 고객 개인정보를 그대로 받아 갈 수 있다.
 */

const SORTABLE = [
  'applied_at',
  'customer_name',
  'birth',
  'tel1',
  'tel2',
  'previous_applied_at',
  'assigned_dept',
  'reason',
  'read_at',
];

/**
 * 이 사용자의 소속.
 *
 * 토큰에는 소속이 없다. 넣어 두면 소속을 옮긴 뒤에도 옛 토큰이 살아 있는 동안
 * 예전 소속 것을 계속 볼 수 있으므로, 다른 API들처럼 그때그때 DB에서 읽는다.
 */
async function departmentOf(userId: number): Promise<string | null> {
  const { data } = await supabase.from('users').select('department').eq('id', userId).single();
  return data?.department ?? null;
}

const LIST_COLUMNS =
  'id, customer_name, birth, tel1, tel2, product_name, reason, order_no, ' +
  'source_file_id, source_file_name, applied_at, ' +
  'assigned_dept, assigned_group, previous_applied_at, assigned_file_id, assigned_file_name, ' +
  'read_at, read_by, created_at';

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const search = (searchParams.get('search') || '').trim();
    const sortByParam = searchParams.get('sortBy') || 'applied_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc';
    const sortBy = SORTABLE.includes(sortByParam) ? sortByParam : 'applied_at';
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    let query = supabase.from('reapply_notices').select(LIST_COLUMNS, { count: 'exact' });

    // 관리자/서브관리자는 전체를 보고 소속으로 걸러 볼 수 있다. 그 외에는 자기 소속만.
    if (canViewAllReapplyNotices(user.role)) {
      const group = (searchParams.get('group') || '').trim();
      if (group) query = query.eq('assigned_group', group);
    } else {
      const department = await departmentOf(user.id);
      // 소속을 못 읽으면 아무것도 안 보여준다. 조건을 빼면 전체가 나간다.
      if (!department) return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
      query = query.eq('assigned_group', department);
    }

    if (unreadOnly) query = query.is('read_at', null);

    if (search) {
      // 사람이 하이픈을 넣거나 빼서 검색하므로 두 형태를 모두 훑는다.
      const digits = search.replace(/\D/g, '');
      const terms = [
        `customer_name.ilike.%${search}%`,
        `product_name.ilike.%${search}%`,
        `tel1.ilike.%${search}%`,
        `tel2.ilike.%${search}%`,
      ];
      if (digits) terms.push(`phone_keys.cs.{${digits}}`);
      query = query.or(terms.join(','));
    }

    // 동점이면 순서가 고정되지 않아 페이지를 넘길 때 행이 중복되거나 빠진다.
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Reapply notices query error:', error);
      return NextResponse.json({ error: '목록을 불러올 수 없습니다.' }, { status: 500 });
    }

    const totalRecords = count ?? 0;
    const records = (data ?? []) as any[];

    /*
     * 누가 확인했는지 이름을 붙인다.
     *
     * read_by에는 사용자 id만 들어 있다. 지사는 자기들끼리 누가 봤는지 알아야
     * 두 사람이 같은 고객에게 또 연락하는 일이 없고, 관리자는 어느 지사의 누가
     * 언제 봤는지 확인할 수 있어야 한다.
     *
     * users를 참조하는 외래키가 없어 조인이 안 되므로 id를 모아 한 번에 읽는다.
     * 알림 한 줄마다 물으면 20줄에 20번 왕복한다.
     */
    const readerIds = [...new Set(records.map((r) => r.read_by).filter(Boolean))];
    const nameById = new Map<number, string>();

    if (readerIds.length > 0) {
      const { data: readers } = await supabase
        .from('users')
        .select('id, name, username')
        .in('id', readerIds);

      for (const reader of readers ?? []) {
        nameById.set(Number(reader.id), String(reader.name || reader.username || ''));
      }
    }

    return NextResponse.json({
      data: records.map((record) => ({
        ...record,
        // 계정을 지웠으면 이름이 없다. 그래도 '확인함'과 시각은 남아야 한다.
        read_by_name: record.read_by ? (nameById.get(Number(record.read_by)) ?? null) : null,
      })),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
      },
    });
  } catch (error) {
    console.error('Reapply notices API error:', error);
    return NextResponse.json({ error: '목록을 불러올 수 없습니다.' }, { status: 500 });
  }
}

/**
 * 확인 처리.
 *
 * 자기 소속 건만 바꿀 수 있다. id만 보내면 남의 소속 건도 읽음으로 만들 수 있으므로
 * 소속 조건을 함께 건다.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { id } = await request.json();
    const noticeId = Number(id);
    if (!Number.isInteger(noticeId) || noticeId <= 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    let query = supabase
      .from('reapply_notices')
      .update({ read_at: new Date().toISOString(), read_by: user.id })
      .eq('id', noticeId)
      // 이미 확인한 건은 그대로 둔다. 처음 본 시각이 덮이면 추적이 안 된다.
      .is('read_at', null);

    if (!canViewAllReapplyNotices(user.role)) {
      const department = await departmentOf(user.id);
      if (!department) return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
      query = query.eq('assigned_group', department);
    }

    const { data, error } = await query.select('id');

    if (error) {
      console.error('Reapply notice read error:', error);
      return NextResponse.json({ error: '확인 처리에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: data?.length ?? 0 });
  } catch (error) {
    console.error('Reapply notice read error:', error);
    return NextResponse.json({ error: '확인 처리에 실패했습니다.' }, { status: 500 });
  }
}
