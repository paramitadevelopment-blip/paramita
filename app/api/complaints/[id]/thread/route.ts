import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { canRegisterComplaints, canViewComplaints, canViewAllComplaints } from '@/lib/roles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 이 민원이 속한 묶음의 지난 건들.
 *
 * 같은 주문·같은 고객으로 여러 번 들어온 민원은 한 흐름이다. 처리하는 사람은
 * "지난번엔 뭐라고 하셨고 우리는 뭐라고 안내했나"를 보고 이어서 대응해야 한다.
 * 그걸 모르고 같은 안내를 되풀이하면 고객은 다음 민원을 넣는다.
 *
 * 목록에 얹지 않고 따로 두는 이유는 크기다 — 통화내역과 처리 내용은 길고,
 * 실제로 읽는 것은 처리 창을 열었을 때뿐이다.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canViewComplaints(user.role) && !canRegisterComplaints(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const complaintId = Number(id);
    if (!Number.isInteger(complaintId) || complaintId <= 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const { data: complaint } = await supabase
      .from('complaints')
      .select('id, thread_key, assigned_group, created_by_id')
      .eq('id', complaintId)
      .maybeSingle();
    if (!complaint) {
      return NextResponse.json({ error: '없는 민원입니다.' }, { status: 404 });
    }

    /*
     * 볼 수 있는 사람인지 다시 본다.
     *
     * 화면에서는 자기 것만 열 수 있지만 요청은 직접 만들 수 있다. 남의 소속
     * 민원의 통화내역과 처리 내용이 열리면 목록을 가려 둔 의미가 없어진다.
     */
    if (!canViewAllComplaints(user.role)) {
      const { data: me } = await supabase
        .from('users')
        .select('department')
        .eq('id', user.id)
        .single();
      const mine =
        Number(complaint.created_by_id) === user.id ||
        (complaint.assigned_group && complaint.assigned_group === me?.department);
      if (!mine) {
        return NextResponse.json({ error: '볼 수 없는 민원입니다.' }, { status: 403 });
      }
    }

    if (!complaint.thread_key) {
      return NextResponse.json({ data: [] });
    }

    const { data, error } = await supabase
      .from('complaints')
      .select(
        'id, sequence_no, called_at, call_memo, product, status, ' +
          'handled_note, handled_by, handled_at, created_at'
      )
      .eq('thread_key', complaint.thread_key)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Complaint thread error:', error);
      return NextResponse.json({ error: '지난 민원을 불러올 수 없습니다.' }, { status: 500 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('Complaint thread error:', error);
    return NextResponse.json({ error: '지난 민원을 불러올 수 없습니다.' }, { status: 500 });
  }
}
