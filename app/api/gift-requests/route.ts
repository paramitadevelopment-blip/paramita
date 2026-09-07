import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import {
  canRequestGift,
  canViewAllGiftRequests,
  canViewGiftRequests,
  canManageGiftRequests,
  isAgentRole,
} from '@/lib/roles';
import { findGiftSource, groupOfDepartment } from '@/lib/giftLookup';
import {
  GIFT_COLUMNS,
  GIFT_STATUSES,
  prefillFromRecord,
  readGiftFields,
  toGiftColumns,
  validateGiftInput,
} from '@/lib/gifts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const SORTABLE = [
  'created_at',
  'customer_name',
  'gift_name',
  'order_no',
  'group_name',
  'requester_name',
  'status',
  'order_date',
];

/** 이 사용자의 소속. 토큰에 없으므로 그때그때 읽는다(소속을 옮기면 곧바로 반영돼야 한다). */
async function departmentOf(userId: number): Promise<string | null> {
  const { data } = await supabase.from('users').select('department').eq('id', userId).single();
  return data?.department ?? null;
}

/**
 * 사은품 신청 목록.
 *
 * 누가 무엇을 보는가:
 *   설계사       자기가 넣은 것
 *   지사         자기 소속에서 넣은 것 전부
 *   사은품담당자  전달된 것부터(forwarded·shipped·supplement). 지사 안에서
 *                아직 오가는 신청(requested)은 남의 일이라 안 보인다
 *   관리자급     전부
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canViewGiftRequests(user.role) && !canManageGiftRequests(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
    const offset = (page - 1) * limit;
    const search = (searchParams.get('search') || '').trim();
    const status = (searchParams.get('status') || '').trim();
    const group = (searchParams.get('group') || '').trim();
    const sortByParam = searchParams.get('sortBy') || 'created_at';
    const sortBy = SORTABLE.includes(sortByParam) ? sortByParam : 'created_at';
    const ascending = searchParams.get('sortOrder') === 'asc';

    let query = supabase.from('gift_requests').select(GIFT_COLUMNS, { count: 'exact' });

    if (canViewAllGiftRequests(user.role)) {
      if (group) query = query.eq('group_name', group);
      // 사은품담당자에게는 전달된 것부터다. 관리자급은 전부 본다.
      if (!canViewGiftRequests(user.role)) {
        query = query.in('status', ['forwarded', 'shipped', 'supplement']);
      }
    } else if (isAgentRole(user.role)) {
      query = query.eq('requester_id', user.id);
    } else {
      const department = await departmentOf(user.id);
      if (!department) {
        return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
      }
      query = query.eq('group_name', department);
    }

    if (status && (GIFT_STATUSES as readonly string[]).includes(status)) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(
        [
          `customer_name.ilike.%${search}%`,
          `order_no.ilike.%${search}%`,
          `gift_name.ilike.%${search}%`,
          `requester_name.ilike.%${search}%`,
          `tracking_no.ilike.%${search}%`,
        ].join(',')
      );
    }

    // 동점이면 순서가 고정되지 않아 페이지를 넘길 때 행이 중복되거나 빠진다.
    const { data, error, count } = await query
      .order(sortBy, { ascending })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Gift requests query error:', error);
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
    console.error('Gift requests API error:', error);
    return NextResponse.json({ error: '목록을 불러올 수 없습니다.' }, { status: 500 });
  }
}

/**
 * 사은품 신청.
 *
 * 주문번호로 배포 기록을 찾아 고객명·전화번호를 **서버가 다시 채운다.** 화면이
 * 미리 보여준 값을 그대로 믿지 않는다 — 요청은 직접 만들 수 있고, 잠근 칸이
 * 뚫리면 사은품이 엉뚱한 사람에게 간다.
 *
 * 남의 지사 고객은 못 넣는다. 배포 기록의 배정소속이 신청자의 소속과 다르면
 * 그 고객은 다른 지사가 받은 사람이다. 관리자급만 예외다.
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
    if (!canRequestGift(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const invalid = validateGiftInput(body ?? {});
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400 });
    }

    const orderNo = String(body.orderNo ?? '').trim();
    const source = await findGiftSource(supabase, orderNo);
    if (!source) {
      return NextResponse.json(
        { error: '배포 기록에 없는 주문번호입니다. 우리가 배포한 고객만 신청할 수 있습니다.' },
        { status: 404 }
      );
    }

    // 신청자의 소속. 관리자급은 소속이 '관리자'라 그 고객의 지사를 대신 적는다.
    const customerGroup = await groupOfDepartment(supabase, source.assignedDept);
    let groupName: string;
    if (canViewAllGiftRequests(user.role)) {
      groupName = customerGroup ?? '';
      if (!groupName) {
        return NextResponse.json({ error: '이 고객의 소속 지사를 알 수 없습니다.' }, { status: 400 });
      }
    } else {
      const department = await departmentOf(user.id);
      if (!department) {
        return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
      }
      if (customerGroup !== department) {
        return NextResponse.json(
          { error: `이 고객은 ${customerGroup ?? '다른'} 지사로 배정된 고객입니다. 우리 지사 고객만 신청할 수 있습니다.` },
          { status: 403 }
        );
      }
      groupName = department;
    }

    const prefill = prefillFromRecord(
      source.row,
      { id: source.fileId, name: source.fileName },
      { name: user.name, groupName }
    );
    const fields = readGiftFields(body);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('gift_requests')
      .insert({
        order_no: orderNo,
        source_file_id: source.fileId,
        source_file_name: source.fileName,
        // 잠긴 칸은 기록에서. 화면이 보낸 값은 쓰지 않는다.
        customer_name: prefill.locked.customerName,
        phone1: prefill.locked.phone1 || null,
        phone2: prefill.locked.phone2 || null,
        ...toGiftColumns(fields),
        requester_id: user.id,
        requester_name: user.name,
        group_name: groupName,
        status: 'requested',
        created_at: now,
        updated_at: now,
      })
      .select(GIFT_COLUMNS)
      .single();

    if (error) {
      console.error('Gift request insert error:', error);
      return NextResponse.json({ error: '신청을 저장하지 못했습니다.' }, { status: 500 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Gift request API error:', error);
    return NextResponse.json({ error: '신청을 저장하지 못했습니다.' }, { status: 500 });
  }
}
