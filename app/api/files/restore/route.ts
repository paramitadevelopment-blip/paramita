import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { hasHistoryAccess } from '@/lib/historyAccess';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Admin만 복구 가능
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can restore files' }, { status: 403 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    // 복구도 히스토리 접근 권한이 있어야 한다.
    if (!hasHistoryAccess(request, user.id)) {
      return NextResponse.json({ error: '비밀번호 확인이 필요합니다.' }, { status: 403 });
    }

    const { eventId, fileIds } = await request.json();

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 });
    }

    // 삭제 이벤트 조회
    const { data: event, error: eventError } = await supabase
      .from('file_deletion_events')
      .select('id, deleted_at, deleted_by, restored_at')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Deletion event not found' }, { status: 404 });
    }

    // 이미 복구된 이벤트는 다시 복구 불가
    if (event.restored_at) {
      return NextResponse.json({ error: 'This event has already been restored' }, { status: 400 });
    }

    // 복구할 파일 목록 조회
    let query = supabase
      .from('deleted_files')
      .select('id, name, size, storage_path, department_id, is_original, original_file_id, mime_type, uploaded_by, uploaded_at')
      .eq('deletion_event_id', eventId)
      // 이미 복구된 파일은 기록만 남아 있으므로 다시 넣지 않는다.
      .is('restored_at', null);

    // fileIds가 지정되면 선택 복구, 없으면 전체 복구
    if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
      query = query.in('id', fileIds);
    }

    const { data: filesToRestore, error: filesError } = await query;

    if (filesError) {
      throw filesError;
    }

    if (!filesToRestore || filesToRestore.length === 0) {
      return NextResponse.json({ error: '복구할 파일이 없습니다.' }, { status: 400 });
    }

    const restoredFileIds = filesToRestore.map((f) => f.id);
    const restoredAt = new Date().toISOString();

    // 1. files 테이블에 파일 복구
    const filesToInsert = filesToRestore.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      storage_path: f.storage_path,
      department_id: f.department_id,
      is_original: f.is_original,
      original_file_id: f.original_file_id,
      mime_type: f.mime_type,
      // 삭제 시점에 보존해 둔 원래 업로더 정보를 그대로 되돌린다.
      uploaded_by: f.uploaded_by,
      uploaded_at: f.uploaded_at,
      download_count: 0,
      created_at: f.uploaded_at,
      updated_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('files')
      .insert(filesToInsert);

    if (insertError) {
      console.error('File restore insert error:', insertError);
      return NextResponse.json(
        { error: `파일 복구에 실패했습니다. (${insertError.message})` },
        { status: 500 }
      );
    }

    // 2. 히스토리는 지우지 않고 복구됨으로 표시한다.
    //    무엇이 삭제됐고 무엇이 복구됐는지 목록이 남아야 하기 때문이다.
    const { error: markError } = await supabase
      .from('deleted_files')
      .update({ restored_at: restoredAt })
      .in('id', restoredFileIds);

    if (markError) {
      console.error('Mark restored error:', markError);
    }

    // 2-1. 이 이벤트로 끊겼던 배포 파일 연결을 되살린다.
    //      부모 원본이 실제로 복구된 것만 다시 이어붙인다.
    const restoredIdSet = new Set(restoredFileIds);

    const { data: severedLinks, error: severedError } = await supabase
      .from('severed_file_links')
      .select('id, file_id, original_file_id')
      .eq('deletion_event_id', eventId)
      .is('restored_at', null);

    if (severedError) {
      console.error('Severed links fetch error:', severedError);
    }

    const relinkable = (severedLinks || []).filter((l) => restoredIdSet.has(l.original_file_id));

    for (const link of relinkable) {
      const { error: relinkError } = await supabase
        .from('files')
        .update({ original_file_id: link.original_file_id })
        .eq('id', link.file_id);

      if (relinkError) {
        console.error('Relink distributed file error:', relinkError);
        continue;
      }

      const { error: markLinkError } = await supabase
        .from('severed_file_links')
        .update({ restored_at: restoredAt })
        .eq('id', link.id);

      if (markLinkError) {
        console.error('Mark severed link restored error:', markLinkError);
      }
    }

    // 3. 남은 미복구 파일이 없을 때만 이벤트 전체를 복구됨으로 표시한다.
    const { count: remainingCount, error: remainingError } = await supabase
      .from('deleted_files')
      .select('id', { count: 'exact', head: true })
      .eq('deletion_event_id', eventId)
      .is('restored_at', null);

    if (remainingError) {
      console.error('Remaining count error:', remainingError);
    }

    if (!remainingError && (remainingCount || 0) === 0) {
      const { error: updateError } = await supabase
        .from('file_deletion_events')
        .update({
          restored_at: restoredAt,
          restored_by: user.username,
        })
        .eq('id', eventId);

      if (updateError) {
        console.error('Event update error:', updateError);
      }
    }

    return NextResponse.json({
      success: true,
      restoredCount: restoredFileIds.length,
    });
  } catch (error) {
    console.error('File restore error:', error);
    return NextResponse.json({ error: 'Failed to restore files' }, { status: 500 });
  }
}
