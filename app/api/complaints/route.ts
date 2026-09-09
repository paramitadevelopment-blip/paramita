import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { parsePagination } from '@/lib/pagination';
import {
  canRegisterComplaints,
  canViewComplaints,
  canViewAllComplaints,
} from '@/lib/roles';
import { readComplaintInput, toComplaintRow } from '@/lib/complaintIntake';
import { recordTransfer } from '@/lib/complaintTransfers';
import {
  COMPLAINT_COLUMNS,
  COMPLAINT_OVERDUE_DAYS,
  COMPLAINT_STATUS_LABEL,
  MATCH_KEY_LABEL,
  OPEN_STATUSES,
  complaintThreadKey,
  isOpenComplaint,
  type ComplaintRow,
} from '@/lib/complaints';
import { dateSpanOf, ilikeTerms, phoneVariants, statusesMatching } from '@/lib/listSearch';

/**
 * 검색이 훑는 칸 — 목록·상세에서 사람이 읽는 글자는 전부 여기 있다.
 *
 * 새 칸을 붙이면 여기에도 넣는다. 화면에는 보이는데 검색에는 안 걸리는 칸이
 * 하나라도 있으면, 그다음부터 사람은 검색을 믿지 않고 눈으로 훑는다.
 */
const SEARCH_COLUMNS = [
  'customer_name',
  'phone',
  'order_no',
  'product',
  'call_memo',
  'assigned_group',
  'assigned_by',
  'handled_note',
  'handled_by',
  'read_by',
  'return_reason',
  'returned_by',
  'withdraw_reason',
  'withdrawn_by',
  'created_by',
  'source_file_name',
] as const;

/** 날짜만 담는 칸. */
const SEARCH_DAY_COLUMNS = ['received_at', 'order_confirmed_at'] as const;
/** 시각까지 담는 칸. */
const SEARCH_TIME_COLUMNS = ['called_at', 'handled_at', 'created_at'] as const;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 민원.
 *
 * 민원담당자가 메일로 받은 내역을 옮겨 적으면(POST), 그 고객을 직전에 받았던
 * 지사를 찾아 넘긴다. 지사는 자기 소속 것만 본다(GET).
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
/**
 * 한 번에 넣을 수 있는 건수.
 *
 * 한 건마다 과거 배포 기록을 뒤져 담당 지사를 찾으므로, 수백 건을 한 요청에
 * 넣으면 그 요청이 오래 붙들려 있게 된다. 하루치 메일이 이보다 많을 일은 없다.
 */
const BULK_LIMIT = 200;

const SORTABLE = [
  'created_at',
  'received_at',
  'order_confirmed_at',
  'called_at',
  'customer_name',
  'phone',
  'order_no',
  'assigned_group',
  'status',
  // 확인한 것과 안 한 것을 갈라 놓고 보는 자리. 안 본 것부터 보려고 쓴다.
  'read_at',
];



/**
 * 목록에 묶음 정보를 얹는다.
 *
 * 같은 건으로 몇 번째 들어온 것인지(thread_total)와, 그 묶음에 아직 안 끝난
 * 것이 있는지(thread_open)를 붙인다. 화면은 이 둘로 붉게 칠할지를 정한다 —
 * 이미 다 끝난 묶음까지 붉으면 목록이 점점 붉어져 붉은색이 뜻을 잃는다.
 *
 * 한 페이지에 있는 열쇠를 모아 **한 번만** 묻는다. 행마다 물으면 50건짜리
 * 페이지에 조회가 50번 붙는다.
 */
async function withThreadInfo(rows: ComplaintRow[]): Promise<ComplaintRow[]> {
  const keys = [...new Set(rows.map((r) => r.thread_key).filter(Boolean))] as string[];
  if (keys.length === 0) return rows;

  const { data, error } = await supabase
    .from('complaints')
    .select('thread_key, status, read_at')
    .in('thread_key', keys);

  // 묶음 정보를 못 읽어도 목록은 나와야 한다. 표시만 빠진다.
  if (error) {
    console.error('Complaint thread info error:', error);
    return rows;
  }

  const total = new Map<string, number>();
  const open = new Set<string>();
  const unread = new Map<string, number>();
  for (const row of data ?? []) {
    const key = row.thread_key as string;
    total.set(key, (total.get(key) ?? 0) + 1);
    // 반려는 등록자에게 돌아간 것이라 지사가 이어서 할 일이 아니다.
    if (isOpenComplaint(row.status)) {
      open.add(key);
    }
    // 지사에 와 있는데 아직 안 본 회차. 상세를 열면 이것들이 함께 확인된다.
    if (row.status === 'branch' && !row.read_at) {
      unread.set(key, (unread.get(key) ?? 0) + 1);
    }
  }

  return rows.map((row) => ({
    ...row,
    thread_total: row.thread_key ? (total.get(row.thread_key) ?? 1) : 1,
    thread_open: row.thread_key ? open.has(row.thread_key) : false,
    thread_unread: row.thread_key ? (unread.get(row.thread_key) ?? 0) : row.read_at ? 0 : 1,
  }));
}

/**
 * 이 통화가 이미 등록돼 있는가.
 *
 * 같은 주문·같은 고객으로 민원이 여러 번 오는 것은 정상이다 — 통화할 때마다
 * 원하는 것이 달라진다. 그러나 **통화일시까지 같은 것**은 다른 민원이 아니라
 * 같은 통화를 두 번 적은 것이다. 한 번의 통화가 두 건이 될 수는 없다.
 * 메일을 두 번 복사해 붙여넣는 실수가 여기서 걸린다.
 */
async function findSameCall(
  threadKey: string,
  calledAt: string | null,
  exceptId?: number
): Promise<{ id: number; sequence_no: number } | null> {
  if (!calledAt) return null;
  let query = supabase
    .from('complaints')
    .select('id, sequence_no')
    .eq('thread_key', threadKey)
    .eq('called_at', calledAt)
    .limit(1);
  if (exceptId) query = query.neq('id', exceptId);
  const { data } = await query.maybeSingle();
  return data ?? null;
}

/** 이 묶음의 다음 회차. 앞에 몇 건이 있었는지가 곧 회차다. */
async function nextSequenceNo(threadKey: string): Promise<number> {
  const { count } = await supabase
    .from('complaints')
    .select('id', { count: 'exact', head: true })
    .eq('thread_key', threadKey);
  return (count ?? 0) + 1;
}

const DUPLICATE_MESSAGE = '같은 통화일시로 이미 등록된 민원입니다. 같은 내용을 두 번 넣으신 것 같습니다.';

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

/**
 * 접수하자마자 찾아간 지사를 이력 첫 줄로 남긴다.
 *
 * 민원 행에도 지사와 찾은 방법이 적히지만, 나중에 옮기면 그 값이 덮인다.
 * 처음 어디로 갔는지가 사라지면 "한울부원이 아니라고 했다"는 말의 앞이 없어진다.
 * 못 찾아 관리자 앞에 놓인 건은 남길 것이 없다 — 아직 아무 데도 안 갔다.
 */
async function logFirstAssign(
  row: { id: number; assigned_group: string | null; match_key: string | null; created_at: string },
  user: { id: number; username: string }
) {
  if (!row?.assigned_group) return;
  await recordTransfer(supabase, {
    complaintId: row.id,
    kind: 'auto',
    from: null,
    to: row.assigned_group,
    reason: row.match_key ? `${MATCH_KEY_LABEL[row.match_key] ?? row.match_key}로 찾음` : null,
    byId: user.id,
    byName: user.username,
    at: row.created_at,
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 민원을 넣는 담당자는 배정 화면은 못 보지만 넣은 건은 봐야 한다.
    if (!canViewComplaints(user.role) && !canRegisterComplaints(user)) {
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
    } else if (!canViewComplaints(user.role) && canRegisterComplaints(user)) {
      /*
       * 민원을 넣기만 하는 사람(담당자)은 **전부** 본다.
       *
       * 넣는 자리는 사무실 공용이다 — 오늘은 관리자가 넣고 내일은 담당자가
       * 넣는다. 자기가 넣은 것만 보이면 관리자가 넣은 건에 보완 요청이 와도
       * 담당자가 못 고치고, 관리자가 자리에 없으면 그 건은 멈춘다. 지사는
       * 민원을 넣지 않으므로 '전부'라 해도 사무실에서 넣은 것뿐이다.
       */
    } else {
      const department = await departmentOf(user.id);
      // 소속을 못 읽으면 아무것도 안 보여준다. 조건을 빼면 전체가 나간다.
      if (!department) {
        return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
      }
      query = query.eq('assigned_group', department);
    }

    if (status) {
      query = query.eq('status', status);
    }

    /*
     * 밀린 건만 보기.
     *
     * 아직 할 일이 남은 것 중 접수한 지 오래된 것만 남긴다. 목록을 아무리
     * 들여다봐도 안 보이던 "며칠째 안 건드린 건"이 이 조건 하나로 드러난다.
     * 날짜 경계는 서버에서 계산한다 — 화면마다 시계가 다르면 기준이 흔들린다.
     */
    if (searchParams.get('overdueOnly') === 'true') {
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - COMPLAINT_OVERDUE_DAYS);
      // 할 일이 남은 상태만. 목록이 따로 들고 있으면 철회를 더했을 때 빠진다.
      query = query.lt('created_at', since.toISOString()).in('status', [...OPEN_STATUSES]);
    }

    // 아직 안 본 건만 보기. 지사가 새로 온 것부터 처리할 때 쓴다.
    if (searchParams.get('unreadOnly') === 'true') {
      query = query.is('read_at', null);
    }

    /*
     * 검색.
     *
     * 한 줄에 실린 글자 칸은 전부 훑는다 — 무엇으로 찾을 수 있는지 외워야
     * 하는 검색은 검색이 아니다. 여기에 더해 사람이 실제로 치는 세 가지를
     * 알아듣는다: 상태말('보완'), 날짜('2026-09-08'·'260908'), 하이픈 없는
     * 전화번호. 전부 하나의 or()로 묶어 "어디든 걸리면 나온다"로 만든다.
     */
    if (search) {
      const terms = ilikeTerms(SEARCH_COLUMNS, search);

      // 전화번호는 저장된 꼴이 사람마다 달라 숫자 키로도 찾는다.
      const digits = search.replace(/\D/g, '');
      if (digits) terms.push(`phone_keys.cs.{${digits}}`);
      for (const shape of phoneVariants(search)) {
        terms.push(...ilikeTerms(['phone'], shape));
      }

      // '보완'이라고 쳐도 보완 요청 건이 나온다.
      const statuses = statusesMatching(search, COMPLAINT_STATUS_LABEL);
      if (statuses.length > 0) {
        terms.push(`status.in.(${statuses.join(',')})`);
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
     * 아직 안 본 건의 아이디만 달라는 요청.
     *
     * 화면의 [전체 확인]이 쓴다. 상세를 하나씩 여는 것이 원래 길인데 스무 건이면
     * 스무 번 열어야 한다. 위에서 건 조건(소속·검색·상태)이 그대로 걸린 채로
     * 아직 확인 안 한 것만 낸다.
     */
    if (searchParams.get('unreadIds') === 'true') {
      const { data: unread, error: pickError } = await query
        .eq('status', 'branch')
        .is('read_at', null)
        .order('id', { ascending: true })
        .limit(1000);
      if (pickError) {
        console.error('Complaint unread id scan error:', pickError);
        return NextResponse.json({ error: '목록을 불러올 수 없습니다.' }, { status: 500 });
      }
      return NextResponse.json({ ids: (unread ?? []).map((r) => (r as unknown as { id: number }).id) });
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
      data: await withThreadInfo((data ?? []) as unknown as ComplaintRow[]),
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

    if (!canRegisterComplaints(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    /*
     * 여러 건을 한 번에 받는다.
     *
     * 메일 표를 붙여넣으면 수십 건이 한꺼번에 온다. 한 건씩 따로 보내면
     * 그만큼 왕복이 생기고, 중간에 끊기면 어디까지 들어갔는지 알 수 없다.
     * 한 번에 받아 줄마다 결과를 돌려주면 무엇이 되고 무엇이 안 됐는지가 남는다.
     *
     * 한 줄이 잘못돼도 나머지는 넣는다 — 스무 건 중 하나 때문에 열아홉 건을
     * 다시 붙여넣게 하면, 사람은 그 하나를 찾느라 전부를 다시 본다.
     */
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

      const results = [];
      /*
       * 붙여넣은 덩어리 안에서 겹치는 것도 잡는다. 메일을 두 번 복사하면
       * DB에는 아직 없으므로, 방금 넣은 줄까지 기억해 두고 비교해야 걸린다.
       */
      const seenCalls = new Set<string>();

      for (const [at, raw] of body.rows.entries()) {
        const parsedRow = readComplaintInput(raw ?? {});
        if (!parsedRow.ok) {
          results.push({ at, ok: false, error: parsedRow.error });
          continue;
        }

        const threadKey = complaintThreadKey(parsedRow.fields.orderNo, parsedRow.fields.phone);
        const calledAt = parsedRow.fields.calledAt?.toISOString() ?? null;
        const callId = `${threadKey}@${calledAt ?? ''}`;

        if (seenCalls.has(callId) || (await findSameCall(threadKey, calledAt))) {
          results.push({ at, ok: false, error: DUPLICATE_MESSAGE, duplicate: true });
          continue;
        }
        seenCalls.add(callId);

        const { data: row, error: rowError } = await supabase
          .from('complaints')
          .insert({
            ...(await toComplaintRow(supabase, parsedRow.fields)),
            sequence_no: await nextSequenceNo(threadKey),
            created_by_id: user.id,
            created_by: user.username,
          })
          .select(COMPLAINT_COLUMNS)
          .single();

        if (rowError) {
          console.error('Complaint bulk insert error:', rowError);
          results.push({ at, ok: false, error: '등록하지 못했습니다.' });
        } else {
          await logFirstAssign(row as any, user);
          results.push({ at, ok: true, data: row });
        }
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

    const parsed = readComplaintInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const threadKey = complaintThreadKey(parsed.fields.orderNo, parsed.fields.phone);
    const calledAt = parsed.fields.calledAt?.toISOString() ?? null;
    if (await findSameCall(threadKey, calledAt)) {
      return NextResponse.json({ error: DUPLICATE_MESSAGE }, { status: 409 });
    }

    const { data, error } = await supabase
      .from('complaints')
      .insert({
        ...(await toComplaintRow(supabase, parsed.fields)),
        sequence_no: await nextSequenceNo(threadKey),
        created_by_id: user.id,
        created_by: user.username,
      })
      .select(COMPLAINT_COLUMNS)
      .single();

    if (error) {
      console.error('Complaint insert error:', error);
      return NextResponse.json({ error: '민원을 등록하지 못했습니다.' }, { status: 500 });
    }

    await logFirstAssign(data as any, user);

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('Complaint register error:', error);
    return NextResponse.json({ error: '민원을 등록하지 못했습니다.' }, { status: 500 });
  }
}
