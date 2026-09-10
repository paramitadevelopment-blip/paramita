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
  GIFT_STATUS_LABEL,
  prefillFromRecord,
  readGiftFields,
  settlementFor,
  toGiftColumns,
  validateGiftInput,
} from '@/lib/gifts';
import {
  dateSpanOf,
  ilikeTerms,
  numberOf,
  phoneVariants,
  statusesMatching,
} from '@/lib/listSearch';

/**
 * 검색이 훑는 칸 — 상세 창에 뜨는 글자는 전부 여기 있다.
 *
 * 발주리스트 열 열여덟 개가 다 상세에 뜨는 화면이라, 검색이 그중 넷만 본다면
 * 나머지 열넷은 눈으로 찾으라는 말이 된다. 새 칸을 붙이면 여기에도 넣는다.
 */
const SEARCH_COLUMNS = [
  'customer_name',
  'phone1',
  'phone2',
  'zip',
  'address',
  'order_no',
  'customer_no',
  'gift_name',
  'note',
  'delivery_memo',
  'courier',
  'tracking_no',
  'sender_name',
  'sender_phone',
  'product',
  'counselor',
  'settlement',
  'requester_name',
  'group_name',
  'source_file_name',
  'forwarded_by',
  'shipped_by',
  'read_by',
  'checked_by',
  'check_reason',
  'ship_read_by',
  'supplement_reason',
  'supplement_by',
  'withdraw_reason',
  'withdrawn_by',
] as const;

/** 전화번호가 든 칸. 하이픈 없이 쳐도 찾히게 따로 본다. */
const SEARCH_PHONE_COLUMNS = ['phone1', 'phone2', 'sender_phone'] as const;
/** 날짜만 담는 칸. */
const SEARCH_DAY_COLUMNS = ['order_date'] as const;
/** 시각까지 담는 칸. */
const SEARCH_TIME_COLUMNS = [
  'created_at',
  'forwarded_at',
  'shipped_at',
  'checked_at',
] as const;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 한 번에 골라 줄 수 있는 최대 건수.
 *
 * 발주리스트 한 장의 상한(500)보다 넉넉히 잡는다 — 고르기까지는 되고 묶을 때
 * 걸리는 편이, 고르는 단계에서 이유 없이 막히는 것보다 낫다.
 */
const ID_SCAN_LIMIT = 1000;

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
 *   사은품담당자  발주 대기부터(forwarded·ordered·shipped·supplement·withdrawn).
 *                관리자 확인 대기(pending_check)는 아직 담당자 일이 아니라 안 보인다
 *   관리자급     전부
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canViewGiftRequests(user.role) && !canManageGiftRequests(user)) {
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

    /*
     * 사은품 관리 화면이 부를 때는 전달된 것부터만 준다.
     *
     * 담당자에게는 원래 그렇게 주고 있었지만, 관리자는 두 화면을 다 보므로 역할만
     * 보면 관리 화면에도 지사 안에서 아직 오가는 건(지사 전달 대기·관리자 확인
     * 대기)이 섞여 들어온다. 그 건들은 지사가 [전송]을 눌러야 담당자 일이 된다.
     */
    const staffOnly =
      (new URL(request.url).searchParams.get('scope') || '') === 'manage' ||
      !canViewGiftRequests(user.role);

    if (canViewAllGiftRequests(user)) {
      if (group) query = query.eq('group_name', group);
      if (staffOnly) {
        query = query.in('status', ['forwarded', 'ordered', 'shipped', 'supplement', 'withdrawn']);
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

    /*
     * 검색.
     *
     * 상세에 뜨는 글자 칸은 전부 훑고, 사람이 실제로 치는 것도 알아듣는다 —
     * 상태말('보완'), 날짜('2026-09-08'·'260908'), 하이픈 없는 전화번호,
     * 발주 묶음 번호('#39'). 하나의 or()로 묶어 어디든 걸리면 나오게 한다.
     */
    if (search) {
      const terms = ilikeTerms(SEARCH_COLUMNS, search);

      // '01012345678'로 쳐도 '010-1234-5678'로 저장된 줄이 나온다.
      for (const shape of phoneVariants(search)) {
        terms.push(...ilikeTerms(SEARCH_PHONE_COLUMNS, shape));
      }

      // '보완'이라고 쳐도 보완 요청 건이 나온다.
      const statuses = statusesMatching(search, GIFT_STATUS_LABEL);
      if (statuses.length > 0) {
        terms.push(`status.in.(${statuses.join(',')})`);
      }

      // 상세와 목록이 발주 묶음을 '#39'로 부른다. 그대로 쳐도 찾히게 한다.
      const asNumber = numberOf(search);
      if (asNumber !== null) {
        terms.push(`order_id.eq.${asNumber}`);
        terms.push(`quantity.eq.${asNumber}`);
      }

      // 날짜로 치면 그날(또는 그달)에 걸린 건.
      const span = dateSpanOf(search);
      if (span) {
        for (const column of SEARCH_DAY_COLUMNS) {
          terms.push(`and(${column}.gte.${span.fromDay},${column}.lte.${span.toDay})`);
        }
        for (const column of SEARCH_TIME_COLUMNS) {
          terms.push(`and(${column}.gte.${span.from},${column}.lte.${span.to})`);
        }
      }

      query = query.or(terms.join(','));
    }

    /*
     * 아이디만 달라는 요청.
     *
     * 화면의 머리 체크박스는 그 페이지에 뜬 줄만 고른다. 백 건이면 열 페이지를
     * 돌아야 하므로 "지금 조건에 맞는 전부"를 한 번에 고를 길이 필요하다. 화면은
     * 한 페이지밖에 모르니 서버가 골라 준다 — 위에서 건 조건(소속·검색·상태)이
     * 그대로 걸린 채로 아이디만 낸다.
     */
    if (searchParams.get('idsOnly') === 'true') {
      const { data: picked, error: pickError } = await query
        .order('id', { ascending: true })
        .limit(ID_SCAN_LIMIT);
      if (pickError) {
        console.error('Gift requests id scan error:', pickError);
        return NextResponse.json({ error: '목록을 불러올 수 없습니다.' }, { status: 500 });
      }
      const ids = (picked ?? []).map((r) => (r as unknown as { id: number }).id);
      // 한도에 닿았으면 그 사실을 알려 준다 — 조용히 잘라 내면 몇 건이 빠졌는지 모른다.
      return NextResponse.json({ ids, truncated: ids.length >= ID_SCAN_LIMIT });
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
 * 사은품 신청 — 한 건이든 여러 건이든 같은 길을 지난다.
 *
 * 주문번호로 배포 기록을 찾는 것은 어느 쪽이든 같다. 그 기록으로 (1) 우리가
 * 배포한 고객인지, (2) 어느 지사 고객인지를 가른다. 남의 지사 고객은 못 넣는다 —
 * 배포 기록의 배정소속이 신청자의 소속과 다르면 다른 지사가 받은 사람이다.
 * 관리자급만 예외다.
 *
 * 고객명·전화번호를 어디서 가져오는지는 갈린다.
 *   한 건 등록   기록에서. 화면이 조회로 채워 보여주고 그 칸을 잠그므로,
 *                보이는 값과 저장되는 값이 같아야 한다
 *   붙여넣기     붙여넣은 값 그대로. 지사가 정리해 둔 표가 곧 보낼 내용이고
 *                사람은 그 표를 보고 있다
 *
 * 붙여넣기도 고객명은 기록과 대조한다. 고객번호 한 자리가 틀려 남의 기록에
 * 붙는 것이 붙여넣기에서 가장 흔한 사고이고, 그때는 배정 지사까지 어긋난다.
 */
const BULK_LIMIT = 200;

type CreateOutcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: string; code?: 'duplicate' };

async function createOne(
  user: { id: number; name: string; username: string; role: string },
  given: Record<string, unknown>,
  opts: { department: string | null; expectedName?: string; bulk?: boolean }
): Promise<CreateOutcome> {
  const raw: Record<string, unknown> = given ?? {};
  const invalid = validateGiftInput(raw);
  if (invalid) return { ok: false, status: 400, error: invalid };

  const orderNo = String(raw.orderNo ?? '').trim();
  const source = await findGiftSource(supabase, orderNo);
  /*
   * 기록에 없는 번호는 여기서 끝이다. 우리가 배포하지 않은 고객에게 사은품이
   * 나가면 누가 왜 보냈는지 되짚을 길이 없다. 번호를 잘못 적은 것이면 화면에서
   * 고쳐 다시 조회한다.
   */
  if (!source) {
    return {
      ok: false,
      status: 404,
      error: '배포 기록에 없는 주문번호입니다.',
    };
  }

  // 신청자의 소속. 관리자급은 소속이 '관리자'라 그 고객의 지사를 대신 적는다.
  const customerGroup = await groupOfDepartment(supabase, source.assignedDept);
  let groupName: string;
  if (canViewAllGiftRequests(user)) {
    groupName = customerGroup ?? '';
    if (!groupName) return { ok: false, status: 400, error: '이 고객의 소속 지사를 알 수 없습니다.' };
  } else {
    if (!opts.department) return { ok: false, status: 403, error: '소속을 확인할 수 없습니다.' };
    if (customerGroup !== opts.department) {
      return {
        ok: false,
        status: 403,
        error: `이 고객은 ${customerGroup ?? '다른'} 지사로 배정된 고객입니다. 우리 지사 고객만 신청할 수 있습니다.`,
      };
    }
    groupName = opts.department;
  }

  const prefill = prefillFromRecord(
    source.row,
    { id: source.fileId, name: source.fileName },
    { name: user.name, groupName }
  );

  /*
   * 붙여넣은 이름이 기록과 다르면 남의 기록이다. 공백 차이는 봐준다.
   *
   * 저장은 붙여넣은 값으로 하지만 대조는 그대로 둔다 — 고객번호 한 자리가
   * 틀려 엉뚱한 기록에 붙는 것이 붙여넣기에서 가장 흔한 사고이고, 그때는
   * 배정 지사까지 남의 지사가 된다.
   */
  if (opts.expectedName !== undefined) {
    const same = (a: string) => a.replace(/\s+/g, '');
    if (same(opts.expectedName) !== same(prefill.locked.customerName)) {
      return {
        ok: false,
        status: 409,
        error: `고객번호 ${orderNo}의 기록은 '${prefill.locked.customerName}' 님입니다. 붙여넣은 이름('${opts.expectedName}')과 다릅니다.`,
      };
    }
  }

  /*
   * 같은 주문번호로 이미 신청된 건이 있는가.
   *
   * 한 주문번호로 여러 상품을 가입하거나 사은품을 추가로 달라는 일이 있어
   * 막지는 않는다. 대신 왜 또 보내는지를 적게 하고, 관리자가 확인한 뒤에야
   * 담당자에게 간다. 철회한 건은 안 센다 — 그건 없던 일이다.
   */
  const { data: prior } = await supabase
    .from('gift_requests')
    .select('id')
    .eq('order_no', orderNo)
    .neq('status', 'withdrawn');
  const duplicate = (prior ?? []).length > 0;
  const checkReason = String(raw.checkReason ?? '').trim();
  // code가 'duplicate'면 화면은 사유 칸을 연다 — 한 건 창이든 붙여넣기든.
  if (duplicate && !checkReason) {
    return {
      ok: false,
      status: 409,
      code: 'duplicate',
      error: `이미 신청된 주문번호입니다(${prior!.length}건). 사유를 적어 주세요.`,
    };
  }

  /*
   * 고객명·전화번호를 어디서 가져오나.
   *
   * 한 건 등록은 기록에서. 화면이 주문번호로 조회해 그 값을 채워 보여주고 칸을
   * 잠근다 — 보이는 값과 저장되는 값이 같아야 하므로 화면이 보낸 값은 안 쓴다.
   *
   * 붙여넣기는 붙여넣은 값 그대로. 지사가 거래처 양식으로 정리해 둔 표가 곧
   * 보낼 내용이고 사람은 그 표를 보고 있다. 기록의 번호로 덮어쓰면 표에 적힌
   * 번호와 다른 번호로 나가는데, 붙여넣은 사람은 끝까지 모른다. 고객이 번호를
   * 바꿨거나 받는 사람 번호가 따로인 경우가 실제로 있다.
   */
  const pasted = (key: string) => String(raw[key] ?? '').trim();
  const identity = opts.bulk
    ? {
        customer_name: pasted('pastedName') || prefill.locked.customerName,
        phone1: pasted('pastedPhone') || null,
        phone2: pasted('pastedPhone2') || null,
      }
    : {
        customer_name: prefill.locked.customerName,
        phone1: prefill.locked.phone1 || null,
        phone2: prefill.locked.phone2 || null,
      };

  const fields = readGiftFields(raw);
  /*
   * 정산구분을 안 적어 왔으면 보내는 쪽으로 정한다 — 파라인슈는 'DB포함',
   * 나머지는 '정산해당'. 적어 온 값은 그대로 둔다(예외가 있을 수 있다).
   */
  if (!fields.settlement) {
    fields.settlement = settlementFor(fields.senderName || groupName);
  }
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('gift_requests')
    .insert({
      order_no: orderNo,
      source_file_id: source.fileId,
      source_file_name: source.fileName,
      ...identity,
      ...toGiftColumns(fields),
      requester_id: user.id,
      requester_name: user.name,
      group_name: groupName,
      /*
       * 등록이 곧 전달이다. 들어오는 순간 담당자의 발주 대기가 된다. 다만 같은
       * 주문번호의 재신청은 관리자 확인 대기에 멈춰 선다 — 사유와 함께.
       */
      ...(duplicate
        ? { status: 'pending_check', check_reason: checkReason }
        : { status: 'forwarded', forwarded_by: user.username, forwarded_at: now }),
      created_at: now,
      updated_at: now,
    })
    .select(GIFT_COLUMNS)
    .single();

  if (error) {
    console.error('Gift request insert error:', error);
    return { ok: false, status: 500, error: '신청을 저장하지 못했습니다.' };
  }
  return { ok: true, data: data as unknown as Record<string, unknown> };
}

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
    const department = canViewAllGiftRequests(user) ? null : await departmentOf(user.id);

    /* ── 여러 건 (붙여넣기) ───────────────────────────────────── */
    if (Array.isArray(body?.rows)) {
      if (body.rows.length === 0) {
        return NextResponse.json({ error: '등록할 내용이 없습니다.' }, { status: 400 });
      }
      if (body.rows.length > BULK_LIMIT) {
        return NextResponse.json(
          { error: `한 번에 ${BULK_LIMIT}건까지 등록할 수 있습니다.` },
          { status: 400 }
        );
      }
      /*
       * 한 줄이 잘못돼도 나머지는 넣는다 — 스무 건 중 하나 때문에 열아홉 건을
       * 다시 붙여넣게 하면, 사람은 그 하나를 찾느라 전부를 다시 본다.
       *
       * 같은 붙여넣기 안에 같은 고객번호가 여럿이면 앞 줄이 먼저 들어가고 뒷
       * 줄은 그것을 '이미 신청된 건'으로 만난다 — 한 주문번호로 여러 상품을
       * 보내는 경우라, 사유를 받아 관리자 확인으로 보내면 된다. 따로 안 거른다.
       */
      const results: Array<{ at: number; ok: boolean; error?: string; code?: string; data?: unknown }> = [];
      for (const [at, raw] of (body.rows as Record<string, unknown>[]).entries()) {
        const expectedName =
          typeof raw?.pastedName === 'string' && raw.pastedName.trim() ? raw.pastedName.trim() : undefined;
        const outcome = await createOne(user, raw ?? {}, { department, expectedName, bulk: true });
        results.push(
          outcome.ok
            ? { at, ok: true, data: outcome.data }
            : { at, ok: false, error: outcome.error, code: outcome.code }
        );
      }
      return NextResponse.json(
        {
          results,
          created: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
        },
        { status: 201 }
      );
    }

    /* ── 한 건 ─────────────────────────────────────────────── */
    const outcome = await createOne(user, body ?? {}, { department });
    if (!outcome.ok) {
      // code는 화면이 갈래를 타는 열쇠다 — 'duplicate'면 사유 칸을 연다.
      return NextResponse.json({ error: outcome.error, code: outcome.code }, { status: outcome.status });
    }
    return NextResponse.json({ data: outcome.data }, { status: 201 });
  } catch (error) {
    console.error('Gift request API error:', error);
    return NextResponse.json({ error: '신청을 저장하지 못했습니다.' }, { status: 500 });
  }
}
