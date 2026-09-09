import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { isAdminRole } from '@/lib/roles';
import { rowMatches } from '@/lib/listSearch';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/** 한 번에 훑는 최대 건수. 삭제는 드문 일이라 이 정도면 전부 덮는다. */
const SCAN_LIMIT = 2000;

type Kind = 'complaint' | 'gift';

/**
 * 지워진 건의 보관본을 찾는다.
 *
 * 관리자가 민원·사은품을 지우면 그 줄이 통째로 보관본에 남는다. 그런데 볼
 * 방법이 없어서 DB를 직접 열어야 했다 — 보관해 두고 못 보면 안 남긴 것과 같다.
 *
 * "이 고객 민원 어디 갔지?"가 실제로 묻는 말이라, 목록을 훑는 것보다 찾는 것이
 * 먼저다. 고객명·전화·주문번호는 보관본 안(snapshot)에 있으므로 그 안까지 훑는다.
 *
 * 관리자만 본다. 지워진 것에는 남의 지사 고객이 섞여 있고, 지운 사유에는
 * "시험 삼아 넣은 건"처럼 안쪽 사정이 적힌다.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Only admin can view deleted records' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').trim();
    const kindParam = (searchParams.get('type') || '').trim();
    const kinds: Kind[] =
      kindParam === 'complaint' || kindParam === 'gift' ? [kindParam] : ['complaint', 'gift'];
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10)));

    const rows: Array<Record<string, unknown>> = [];

    for (const kind of kinds) {
      const table = kind === 'complaint' ? 'deleted_complaints' : 'deleted_gift_requests';
      const idColumn = kind === 'complaint' ? 'complaint_id' : 'gift_request_id';

      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('deleted_at', { ascending: false })
        .limit(SCAN_LIMIT);
      if (error) throw error;

      for (const record of data ?? []) {
        const snapshot = (record.snapshot ?? {}) as Record<string, unknown>;
        rows.push({
          id: `${kind}-${record.id}`,
          kind,
          kindLabel: kind === 'complaint' ? '민원' : '사은품',
          originalId: record[idColumn],
          // 어느 건이었는지 알아볼 최소한. 나머지는 snapshot 안에 있다.
          customerName: snapshot.customer_name ?? null,
          phone: snapshot.phone ?? snapshot.phone1 ?? null,
          orderNo: snapshot.order_no ?? null,
          group: snapshot.assigned_group ?? snapshot.group_name ?? null,
          summary:
            kind === 'complaint'
              ? (snapshot.call_memo as string | null)
              : [snapshot.gift_name, snapshot.quantity ? `×${snapshot.quantity}` : '']
                  .filter(Boolean)
                  .join(' '),
          status: snapshot.status ?? null,
          createdAt: snapshot.created_at ?? null,
          reason: record.reason,
          deletedBy: record.deleted_by,
          deletedAt: record.deleted_at,
          snapshot,
        });
      }
    }

    /*
     * 거르기는 메모리에서 한다. 보관본의 고객명·전화는 snapshot(jsonb) 안에 있어
     * DB의 ilike로는 못 닿고, 삭제는 드문 일이라 양이 적다.
     */
    const found = search
      ? rows.filter((row) =>
          rowMatches(
            {
              ...row,
              // 찾는 사람은 화면에 뜨는 말로 친다 — '민원'·'사은품'으로도 걸리게.
              snapshot: JSON.stringify(row.snapshot),
            },
            search
          )
        )
      : rows;

    // 두 표를 합쳤으니 다시 시간순으로 세운다.
    found.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));

    return NextResponse.json({ data: found.slice(0, limit), total: found.length });
  } catch (error) {
    console.error('Deleted records fetch error:', error);
    return NextResponse.json({ error: '삭제 기록을 불러올 수 없습니다.' }, { status: 500 });
  }
}
