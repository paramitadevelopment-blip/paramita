import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import { parsePagination } from '@/lib/pagination';
import { normalizeProductName, normalizePhone, normalizeBirth } from '@/lib/insurance';
import { maskJumin } from '@/lib/columnAliases';
import type { BlacklistKey } from '@/lib/blacklist';
import { attachSourceFiles, type SourceFile, type SourceFileHit } from '@/lib/blacklistFiles';
import { recordBlacklistHistory } from '@/lib/blacklistStore';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 블랙리스트 명단.
 *
 * 60일 안에 3회 이상 신청해 지사 배정에서 뺀 사람들이다. 한 번 오르면
 * 자동으로는 안 풀린다 — 그래서 사람이 지울 수 있는 길을 열어 둔다.
 * 오판으로 올라간 사람을 영영 못 푸는 상태가 되면 안 된다.
 */

/** 클라이언트가 정렬 대상을 마음대로 고르지 못하게 목록으로 막는다. */
const SORTABLE = [
  'registered_at',
  'customer_name',
  'product_name',
  'request_count',
  'birth',
  'tel2',
  'reason',
  'source_file_name',
  'released_at',
  'registered_by',
];

const LIST_COLUMNS =
  'id, customer_name, product_name, birth, tel1, tel2, reason, request_count, registered_by, source_file_id, source_file_name, registered_at, released_at, release_reason';

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ error: 'Only admin can view blacklist' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const search = (searchParams.get('search') || '').trim();
    const sortByParam = searchParams.get('sortBy') || 'registered_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc';
    const sortBy = SORTABLE.includes(sortByParam) ? sortByParam : 'registered_at';

    let query = supabase
      .from('blacklist')
      .select(LIST_COLUMNS, { count: 'exact' });

    /*
     * 차단 중인 명단과 해제된 이력은 서로 다른 화면이다. 섞어 놓으면 같은
     * 번호가 활성 한 줄·해제 두 줄로 보여, 지금 막혀 있는지 표만 봐서는 알 수 없다.
     * 그래서 명단 화면은 둘 중 하나만 보여준다 — 기본은 "지금 누가 막혀 있나"다.
     *
     *   active(기본) 차단 중인 것만 · released 해제된 것만 · all 둘 다
     *
     * 검색은 "이 사람 기록이 있나"를 확인하는 자리라 all을 쓴다. 거기서 해제된
     * 건을 숨기면 "기록이 없다"와 "풀어줬다"가 같은 화면이 되어 구분이 안 된다.
     */
    const status = searchParams.get('status') ?? 'active';
    if (status === 'released') {
      query = query.not('released_at', 'is', null);
    } else if (status !== 'all') {
      query = query.is('released_at', null);
    }

    if (search) {
      // 이름·상품·전화·생년월일 어디에 걸려도 찾히게 한다. 전화번호는 사람이
      // 하이픈을 넣거나 빼서 검색하므로 두 형태를 모두 훑는다.
      const digits = search.replace(/\D/g, '');
      const terms = [
        `customer_name.ilike.%${search}%`,
        `product_name.ilike.%${search}%`,
        `birth.ilike.%${search}%`,
        `tel1.ilike.%${search}%`,
        `tel2.ilike.%${search}%`,
        `source_file_name.ilike.%${search}%`,
      ];
      if (digits) {
        terms.push(`phone_keys.cs.{${digits}}`);
      }
      query = query.or(terms.join(','));
    }

    // 동점이면 순서가 고정되지 않아 페이지를 넘길 때 행이 중복되거나 빠진다.
    const { data, error, count } = await query
      .order(sortBy, { ascending: sortOrder })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Blacklist query error:', error);
      return NextResponse.json({ error: 'Failed to load blacklist' }, { status: 500 });
    }

    const totalRecords = count ?? 0;
    const records = data ?? [];

    /*
     * 출처 목록은 저장해 둔 신청 건에서 만든다.
     *
     * 예전에는 조회할 때마다 최근 60일 파일을 훑어 만들었다. 그러면 파일을
     * 지우거나 60일이 지났을 때 목록에서 사라지는데, 명단은 영구 보관이라
     * '3회' 옆에 두 줄만 뜨는 일이 생긴다. 신청횟수도 이 표의 줄 수라
     * 둘이 같은 자리에서 나온다.
     */
    const applicationsByRecord = new Map<number, SourceFileHit[]>();
    if (records.length > 0) {
      const { data: applications, error: appError } = await supabase
        .from('blacklist_applications')
        .select('blacklist_id, order_key, customer_name, product_name, source_file_id, source_file_name, applied_at')
        .in('blacklist_id', records.map((r) => r.id))
        .order('applied_at', { ascending: false, nullsFirst: false });

      if (appError) {
        // 목록을 못 만들어도 명단 자체는 보여줘야 한다. 다만 조용히 넘기면
        // 이 기능이 죽어 있는 걸 아무도 모른다.
        console.error('Blacklist application lookup failed:', appError);
      }

      for (const row of applications ?? []) {
        const id = Number(row.blacklist_id);
        const hit: SourceFileHit = {
          id: row.source_file_id ?? null,
          // 파일을 지워도 이름은 남는다. 이름이 있으면 파일 삭제 히스토리에서
          // 그 파일을 되짚을 수 있다.
          name: row.source_file_name || '-',
          orderNo: row.order_key ?? '',
          customerName: row.customer_name ?? '',
          product: row.product_name ?? '',
        };

        const bucket = applicationsByRecord.get(id);
        if (bucket) bucket.push(hit);
        else applicationsByRecord.set(id, [hit]);
      }
    }

    // 아직 신청 건이 없는 줄(옛 데이터·관리자 수동 등록)은 파일을 훑어 채운다.
    // 60일치 파일을 한 번만 읽어 행 키로 바꿔 둔다. 예전에는 이 조회가 명단
    // 한 줄마다 돌아서, 10줄이면 같은 파일을 열 번 퍼 올려 열 번 파싱했다.
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: files, error: filesError } = await supabase
      .from('files')
      // 열 이름은 name이다. file_name으로 물으면 쿼리가 통째로 실패한다.
      .select('id, name, uploaded_at, file_content')
      .gte('uploaded_at', sixtyDaysAgo.toISOString())
      .eq('is_original', true)
      .order('uploaded_at', { ascending: false });

    if (filesError) {
      // 전개를 못 해도 명단 자체는 보여줘야 한다. 다만 조용히 넘기면 이 기능이
      // 죽어 있는 걸 아무도 모른다 — 실제로 열 이름이 틀린 채 그렇게 지냈다.
      console.error('Blacklist source-file expansion failed:', filesError);
    }

    const fileKeys: SourceFile[] = [];
    for (const file of files ?? []) {
      try {
        const content = Array.isArray(file.file_content)
          ? file.file_content
          : JSON.parse(String(file.file_content || '[]'));

        fileKeys.push({
          id: file.id,
          name: file.name || '-',
          rows: content.map((row: Record<string, unknown>) => ({
            orderNo: String(row['주문번호'] ?? ''),
            customerName: String(row['고객명'] ?? ''),
            product: String(row['상품명'] ?? ''),
            key: {
              product: normalizeProductName(String(row['상품명'] ?? '')),
              birth: maskJumin(String(row['생년월일성별'] ?? '')).slice(0, 7),
              tel1: normalizePhone(String(row['Tel1'] ?? '')),
              tel2: normalizePhone(String(row['Tel2'] ?? '')),
            },
          })),
        });
      } catch {
        // 파일 파싱 실패는 무시한다. 한 파일이 깨졌다고 명단 전체를 못 보면 안 된다.
      }
    }

    // 사람마다 신청 건별 출처 목록을 붙인다. 행은 쪼개지 않는다 —
    // 한 사람이 표에서 한 줄이어야 신청횟수·해제 버튼이 그 사람 것으로 읽힌다.
    //
    // 저장해 둔 신청 건이 있으면 그걸 쓰고, 없는 줄만 파일을 훑어 채운다.
    // 옛 데이터는 아직 신청 건이 없어서, 그 줄까지 빈칸으로 두면 지금 보이던
    // 출처가 갑자기 사라진다.
    const expandedData = attachSourceFiles(
      records,
      (record): BlacklistKey => ({
        product: record.product_name || '',
        birth: record.birth || '',
        tel1: record.tel1 || '',
        tel2: record.tel2 || '',
      }),
      fileKeys
    ).map((record) => {
      const stored = applicationsByRecord.get(record.id);
      return stored && stored.length > 0 ? { ...record, source_files: stored } : record;
    });

    // 이력도 한 번에 읽는다. 전개하면 같은 id가 여러 줄이 되므로 id로 묶어 둔다.
    const historyByRecord = new Map<number, unknown[]>();
    if (records.length > 0) {
      const { data: history } = await supabase
        .from('blacklist_history')
        .select('id, blacklist_id, action, reason, created_at')
        .in('blacklist_id', records.map((r) => r.id))
        .order('created_at', { ascending: false });

      for (const item of history ?? []) {
        const bucket = historyByRecord.get(item.blacklist_id);
        if (bucket) bucket.push(item);
        else historyByRecord.set(item.blacklist_id, [item]);
      }
    }

    const dataWithHistory = expandedData.map((record) => ({
      ...record,
      history: historyByRecord.get(record.id) ?? [],
    }));

    return NextResponse.json({
      data: dataWithHistory,
      pagination: {
        page,
        limit,
        // 페이지를 나누는 기준은 명단의 줄 수다. 전개된 행 수로 세면 지금 페이지에
        // 몇 줄이 펼쳐졌느냐에 따라 전체 쪽수가 흔들려 뒷페이지가 사라진다.
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
      },
    });
  } catch (error) {
    console.error('Blacklist API error:', error);
    return NextResponse.json({ error: 'Failed to load blacklist' }, { status: 500 });
  }
}

/**
 * 블랙리스트에 직접 등록한다.
 *
 * 관리자가 수동으로 고객을 추가한다.
 */
export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ error: 'Only admin can register blacklist' }, { status: 403 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await request.json();
    const { customerName, birth, tel1, tel2, reason } = body;

    // 유효성 검사
    if (!customerName || !birth || !tel1 || !reason) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 });
    }

    // 저장하는 값과 판정하는 값은 같은 모양이어야 한다. birth와 birth_key를
    // 따로 자르면 경로마다 키가 어긋나 같은 사람을 못 찾는다.
    const birthKey = normalizeBirth(birth);
    const phone1 = normalizePhone(tel1);
    const phone2 = normalizePhone(tel2);
    const phoneKeys = Array.from(new Set([phone1, phone2].filter(Boolean)));

    if (!birthKey || phoneKeys.length === 0) {
      return NextResponse.json({ error: '정규화 실패. 입력값을 확인하세요.' }, { status: 400 });
    }

    // 수동 등록은 전화번호만으로 같은 사람을 가린다. 상품은 받지 않고,
    // 사람이 직접 넣는 생년월일은 표기가 흔들려 기준으로 쓰기 어렵다.
    // phone_keys의 GIN 인덱스를 그대로 타므로 명단이 커져도 전량을 읽지 않는다.
    const { data: existing } = await supabase
      .from('blacklist')
      .select('id')
      .overlaps('phone_keys', phoneKeys)
      .is('released_at', null)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: '이미 블랙리스트에 등록된 고객입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('blacklist')
      .insert({
        // 수동 등록은 상품을 가리지 않는다. 판정용 키는 비워 두고 표시만 '-'로 남긴다.
        product_key: '',
        birth_key: birthKey,
        phone_keys: phoneKeys,
        customer_name: customerName,
        product_name: '',
        birth: birthKey,
        tel1: phone1,
        tel2: phone2 || phone1,
        reason,
        request_count: 0,
        // 화면에서 사람이 올린 건이다. 배포가 올린 건과 갈라 보여준다.
        registered_by: 'admin',
      })
      .select('id');

    if (error) {
      console.error('Blacklist insert error:', error);
      return NextResponse.json({ error: '등록에 실패했습니다.' }, { status: 500 });
    }

    // 등록 이력 기록
    if (data && data.length > 0) {
      await recordBlacklistHistory(supabase, data[0].id, 'registered', reason);
    }

    return NextResponse.json({ success: true, id: data?.[0]?.id });
  } catch (error) {
    console.error('Blacklist POST error:', error);
    return NextResponse.json({ error: '등록에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * 명단에서 뺀다 (soft delete).
 *
 * **같은 사람의 줄을 한꺼번에 푼다.** 한 사람이 여러 줄로 오르는 일이 흔한데
 * (이름이 다르게 적혀 왔거나, 상품이 여럿이거나, 수동으로 또 올렸거나)
 * 누른 줄만 풀면 나머지 줄이 같은 번호로 계속 막는다. 화면에는 '해제됨'이라고
 * 적혀 있는데 배정에서는 여전히 빠져, 관리자가 원인을 찾을 방법이 없다.
 *
 * 같은 사람인지는 판정과 같은 기준(전화번호 겹침)으로 본다. 여기서만 다른
 * 기준을 쓰면 푼 줄과 막는 줄이 어긋난다.
 *
 * 기록을 남긴다. 해제된 시간과 사유를 추적할 수 있어야 한다.
 * 자동으로는 안 풀리는 규칙이라 사람이 지우는 것 말고는 되돌릴 방법이 없다.
 * 다만 지운 뒤에도 그 사람이 60일 안에 3회를 다시 채우면 또 올라간다 —
 * 지우는 건 '이번 판정을 취소'하는 것이지 '앞으로 면제'가 아니다.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ error: 'Only admin can delete blacklist' }, { status: 403 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');
    const reason = (searchParams.get('reason') || '오판').trim();
    const id = Number(idParam);

    if (!idParam || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    // 누른 줄의 번호를 먼저 읽는다. 같은 사람을 가릴 기준이다.
    const { data: target, error: targetError } = await supabase
      .from('blacklist')
      .select('phone_keys')
      .eq('id', id)
      .maybeSingle();

    if (targetError || !target) {
      return NextResponse.json({ error: '해당 항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const phones = (target.phone_keys ?? []).filter(Boolean);

    const patch = {
      released_at: new Date().toISOString(),
      release_reason: reason,
      updated_at: new Date().toISOString(),
    };

    // 이미 해제된 줄은 건드리지 않는다 — 예전 해제 사유와 시각을 덮어쓰면
    // 언제 왜 풀렸는지 추적할 수 없다.
    const pending = supabase.from('blacklist').update(patch).is('released_at', null);

    // 번호가 없으면 같은 사람을 가릴 근거가 없으니 그 줄만 푼다.
    // 겹침 조회는 phone_keys의 GIN 인덱스를 그대로 탄다.
    const { data: released, error } =
      phones.length > 0
        ? await pending.overlaps('phone_keys', phones).select('id')
        : await pending.eq('id', id).select('id');

    if (error) {
      console.error('Blacklist release error:', error);
      return NextResponse.json({ error: '해제에 실패했습니다.' }, { status: 500 });
    }

    const releasedIds = (released ?? []).map((row) => row.id);

    // 해제 이력. 한 건씩 넣으면 왕복이 그만큼 늘어나 한 번에 밀어 넣는다.
    if (releasedIds.length > 0) {
      const { error: historyError } = await supabase.from('blacklist_history').insert(
        releasedIds.map((blacklistId) => ({
          blacklist_id: blacklistId,
          action: 'released' as const,
          reason,
        }))
      );

      if (historyError) {
        console.error('Failed to record blacklist history:', historyError);
      }
    }

    return NextResponse.json({ success: true, releasedCount: releasedIds.length });
  } catch (error) {
    console.error('Blacklist release error:', error);
    return NextResponse.json({ error: '해제에 실패했습니다.' }, { status: 500 });
  }
}
