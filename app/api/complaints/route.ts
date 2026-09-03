import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { parsePagination } from '@/lib/pagination';
import {
  canRegisterComplaints,
  canViewComplaints,
  canViewAllComplaints,
  isAgentRole,
  isComplaintStaffRole,
} from '@/lib/roles';
import { readComplaintInput, toComplaintRow } from '@/lib/complaintIntake';
import { COMPLAINT_COLUMNS } from '@/lib/complaints';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 민원.
 *
 * 민원담당자가 메일로 받은 내역을 옮겨 적으면(POST), 그 고객을 직전에 받았던
 * 지사를 찾아 넘긴다. 지사·설계사는 자기 것만 본다(GET).
 *
 * 보이는 범위를 화면에서 가리지 않고 여기서 조건으로 건다 — 요청을 직접
 * 만들면 남의 고객 개인정보를 그대로 받아 갈 수 있다.
 */

/*
 * 정렬할 수 있는 열.
 *
 * 화면에 보이는 값은 다 여기 있어야 한다 — 표에 있는데 못 누르는 열이 섞이면
 * 어느 것이 되는지 매번 눌러 봐야 안다. 다만 통화내역·처리 내용은 뺀다.
 * 자유롭게 적는 글이라 글자순으로 줄을 세워도 읽히는 순서가 되지 않는다.
 *
 * 목록에 없는 값이 오면 기본값으로 되돌린다 — 비밀번호 해시 같은 열 이름을
 * 넣어 정렬 순서로 값을 추측하는 걸 막는다.
 */
const SORTABLE = [
  'created_at',
  'received_at',
  'called_at',
  'customer_name',
  'phone',
  'order_no',
  'assigned_group',
  'agent_name',
  'status',
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

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 민원담당자는 이 화면을 못 보지만 자기가 넣은 건은 봐야 한다.
    if (!canViewComplaints(user.role) && !canRegisterComplaints(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const search = (searchParams.get('search') || '').trim();
    const status = (searchParams.get('status') || '').trim();
    const sortByParam = searchParams.get('sortBy') || 'created_at';
    const sortBy = SORTABLE.includes(sortByParam) ? sortByParam : 'created_at';
    const ascending = searchParams.get('sortOrder') === 'asc';

    let query = supabase.from('complaints').select(COMPLAINT_COLUMNS, { count: 'exact' });

    /*
     * 누가 무엇을 보는가. 순서가 중요하다 — 관리자급을 먼저 걸러야 아래 소속
     * 조건에 걸리지 않는다.
     */
    if (canViewAllComplaints(user.role)) {
      const group = (searchParams.get('group') || '').trim();
      if (group) query = query.eq('assigned_group', group);
    } else if (isAgentRole(user.role)) {
      // 설계사는 자기에게 넘어온 것만. 소속이 같아도 남의 건은 안 보인다.
      query = query.eq('agent_id', user.id);
    } else if (isComplaintStaffRole(user.role)) {
      // 민원담당자는 자기가 넣은 것만. 남의 지사 처리 상황은 보지 않는다.
      query = query.eq('created_by_id', user.id);
    } else {
      const department = await departmentOf(user.id);
      // 소속을 못 읽으면 아무것도 안 보여준다. 조건을 빼면 전체가 나간다.
      if (!department) {
        return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
      }
      query = query.eq('assigned_group', department);
    }

    if (status) query = query.eq('status', status);

    if (search) {
      const digits = search.replace(/\D/g, '');
      const terms = [
        `customer_name.ilike.%${search}%`,
        `product.ilike.%${search}%`,
        `order_no.ilike.%${search}%`,
        `phone.ilike.%${search}%`,
      ];
      if (digits) terms.push(`phone_keys.cs.{${digits}}`);
      query = query.or(terms.join(','));
    }

    // 동점이면 순서가 고정되지 않아 페이지를 넘길 때 행이 중복되거나 빠진다.
    const { data, error, count } = await query
      .order(sortBy, { ascending })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Complaints query error:', error);
      return NextResponse.json({ error: '목록을 불러올 수 없습니다.' }, { status: 500 });
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
    console.error('Complaints API error:', error);
    return NextResponse.json({ error: '목록을 불러올 수 없습니다.' }, { status: 500 });
  }
}

/**
 * 민원 접수.
 *
 * 넣는 즉시 담당 지사를 찾는다. 나중에 따로 돌리지 않는 이유는, 넣은 사람이
 * "이 건이 어디로 갔는지"를 그 자리에서 봐야 잘못 적은 것을 바로 고치기
 * 때문이다. 못 찾으면 관리자에게 남는다(status='unassigned').
 */
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    if (!canRegisterComplaints(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = readComplaintInput(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('complaints')
      .insert({
        ...(await toComplaintRow(supabase, parsed.fields)),
        created_by_id: user.id,
        created_by: user.username,
      })
      .select(COMPLAINT_COLUMNS)
      .single();

    if (error) {
      console.error('Complaint insert error:', error);
      return NextResponse.json({ error: '민원을 등록하지 못했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Complaint register error:', error);
    return NextResponse.json({ error: '민원을 등록하지 못했습니다.' }, { status: 500 });
  }
}
