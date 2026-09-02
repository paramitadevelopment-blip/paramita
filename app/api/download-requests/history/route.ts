import { NextRequest, NextResponse } from 'next/server';
import { isAdminRole } from '@/lib/roles';
import { getUserFromRequest } from '@/lib/jwt';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 한 사용자가 한 파일에 대해 낸 재다운로드 요청 이력(타임라인).
 * 요청은 거부돼도 다시 낼 수 있어 여러 건이 쌓이므로 시간순으로 전부 내려준다.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    const userIdParam = searchParams.get('userId');

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    // 계정이 지워진 사람의 이력은 user_id가 NULL이라 id로는 찾을 수 없다.
    // 그때는 요청에 복사해 둔 아이디로 찾는다. 관리자만 쓸 수 있다.
    const isAdmin = isAdminRole(user.role);
    const deletedUsername = isAdmin ? searchParams.get('username') : null;

    let query = supabase
      .from('redownload_requests')
      .select('id, status, requested_at, reason, reviewed_at, review_reason, reviewed_by, reviewed_by_name')
      .eq('file_id', fileId);

    if (isAdmin && userIdParam) {
      const targetUserId = parseInt(userIdParam);
      if (Number.isNaN(targetUserId)) {
        return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
      }
      query = query.eq('user_id', targetUserId);
    } else if (deletedUsername) {
      // 같은 아이디로 계정을 다시 만들었을 수 있다. user_id가 비어 있는 것만 골라
      // 지워진 그 사람의 이력만 나오게 한다.
      query = query.eq('username', deletedUsername).is('user_id', null);
    } else {
      // 비관리자는 남의 이력을 볼 수 없다. userId를 보내와도 무시하고 본인으로 고정한다.
      query = query.eq('user_id', user.id);
    }

    const { data: records, error } = await query
      .order('requested_at', { ascending: false })
      .order('id', { ascending: false });

    if (error) {
      console.error('Failed to fetch request history:', error);
      return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
    }

    // 처리자 이름은 처리 시점에 저장해 둔 값을 쓴다. 그때그때 users에서 읽으면
    // 그 관리자가 삭제됐을 때 "누가 승인했는지"가 이력에서 사라진다.
    return NextResponse.json({
      success: true,
      records: (records || []).map((r: any) => ({
        id: r.id,
        status: r.status,
        requested_at: r.requested_at,
        reason: r.reason || null,
        reviewed_at: r.reviewed_at,
        review_reason: r.review_reason || null,
        reviewed_by_name: r.reviewed_by_name || null,
      })),
    });
  } catch (error) {
    console.error('Request history error:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
