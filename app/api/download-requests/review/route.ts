import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// redownload_requests의 CHECK 제약과 같은 값이어야 한다.
const REASON_MAX_LENGTH = 500;

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ error: 'Only admin can review requests' }, { status: 403 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await request.json();
    const { requestId, action, reason } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'requestId and action are required' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
    }

    // 거부는 사유가 사용자에게 그대로 노출되므로 필수로 받는다.
    // 프론트에서도 막지만 콘솔로 직접 쏘는 요청은 여기서만 막힌다.
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

    if (action === 'reject') {
      if (!trimmedReason) {
        return NextResponse.json({ error: '거부 사유는 필수입니다.' }, { status: 400 });
      }

      // DB CHECK와 같은 한도. 여기서 걸러야 제약 위반이 500으로 새어 나가지 않는다.
      if (trimmedReason.length > REASON_MAX_LENGTH) {
        return NextResponse.json(
          { error: `거부 사유는 ${REASON_MAX_LENGTH}자 이하로 입력해주세요.` },
          { status: 400 }
        );
      }
    }

    // 1. Get the request
    const { data: targetRequest } = await supabase
      .from('redownload_requests')
      .select('id, status')
      .eq('id', requestId)
      .single();

    if (!targetRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // 2. Check if already reviewed
    if (targetRequest.status !== 'pending') {
      return NextResponse.json(
        { error: 'This request has already been reviewed' },
        { status: 400 }
      );
    }

    // 3. Update the request
    // 처리자 이름은 지금 값을 함께 남긴다. reviewed_by만 두면 그 관리자가 삭제될 때
    // (외래키가 SET NULL이라) "누가 승인했는지"가 통째로 사라진다.
    const { data: reviewer } = await supabase
      .from('users')
      .select('name')
      .eq('id', user.id)
      .single();

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const { error: updateError } = await supabase
      .from('redownload_requests')
      .update({
        status: newStatus,
        reviewed_by: user.id,
        reviewed_by_name: reviewer?.name || user.name || null,
        reviewed_at: new Date().toISOString(),
        review_reason: action === 'reject' ? trimmedReason : null,
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Failed to update request:', updateError);
      return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Request ${newStatus} successfully`,
    });
  } catch (error) {
    console.error('Download request review error:', error);
    return NextResponse.json({ error: 'Failed to review request' }, { status: 500 });
  }
}
