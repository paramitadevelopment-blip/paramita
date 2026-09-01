import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { extractDeviceInfo } from '@/lib/deviceInfo';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const STORAGE_BUCKET = 'files';
const REASON_MAX_LENGTH = 500;

/**
 * 파일전달 대기열(아직 분류 전인 원본)의 미리보기·다운로드·삭제.
 *
 * /api/files/download/[id]·delete는 '원본파일 관리'용이다 — 관리자 전용
 * 접근, 소속 일치, 다운로드 한도, 재다운로드 승인 같은 배포 이후의 규칙이
 * 잔뜩 붙어 있다. 파일전달은 아직 분류·배포되지 않은 원본 대기열을 보는
 * 화면이라 그 규칙과 무관해 라우트를 따로 둔다.
 *
 * 다만 "누가 무엇을 받아갔고 무엇을 지웠는지"는 관리자가 한 곳(다운로드
 * 로그·파일 삭제 히스토리)에서 보는 공용 기록이다. 화면이 갈라졌다고 기록까지
 * 갈라지면 관리자가 반쪽짜리 이력만 보게 되므로, 기록은 원본파일 관리와
 * 같은 표(download_records, file_deletion_events/deleted_files)에 남긴다.
 *
 * my-uploads 목록과 같은 범위다 — 누가 올렸든 관리자·DB담당자 전원이 같은
 * 대기열을 보고 다루므로, 올린 사람으로 걸러 남의 것을 못 보게 막지 않는다.
 */
async function loadQueuedUpload(fileId: string) {
  return supabase
    .from('files')
    .select(
      'id, name, size, storage_path, mime_type, department_id, is_original, original_file_id, uploaded_by, uploaded_by_name, uploaded_at, file_content, source'
    )
    .eq('id', fileId)
    .eq('is_original', true)
    // 파일전달 대기열 것만 다룬다. 관리자가 파일업로드에서 직접 올린 원본은
    // 원본파일 관리 쪽 규칙(삭제 사유·배포본 연결 끊기 등)을 따라야 하므로
    // 이 라우트로는 건드릴 수 없어야 한다.
    .eq('source', 'file_transfer')
    .single();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'admin' && user.role !== 'subadmin' && user.role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: fileId } = await params;

  const { data: file, error: queryError } = await loadQueuedUpload(fileId);
  if (queryError || !file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .download(file.storage_path);

  if (downloadError || !fileData) {
    console.error('File-transfer storage download error:', downloadError);
    return NextResponse.json({ error: '파일을 불러올 수 없습니다.' }, { status: 500 });
  }

  // 다운로드 로그는 표시용 기록이라 실패해도 파일은 그대로 내보낸다.
  // 한도가 없는 화면이라 attempt_no는 정보용일 뿐, 검사에는 안 쓴다.
  try {
    const { data: downloader } = await supabase
      .from('users')
      .select('department, name, employee_id')
      .eq('id', user.id)
      .single();

    const { count: existingCountRaw } = await supabase
      .from('download_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('file_id', fileId);

    const deviceInfo = extractDeviceInfo(request);

    const { error: logError } = await supabase.from('download_records').insert({
      file_id: fileId,
      user_id: user.id,
      attempt_no: (existingCountRaw || 0) + 1,
      file_name: file.name,
      downloaded_by: user.username,
      user_name: downloader?.name || null,
      user_employee_id: downloader?.employee_id || null,
      user_department: downloader?.department || null,
      downloaded_at: new Date().toISOString(),
      file_content: file.file_content || [],
      ip_address: deviceInfo.ip_address,
      device_type: deviceInfo.device_type,
      os_name: deviceInfo.os_name,
      browser_name: deviceInfo.browser_name,
    });

    if (logError) {
      console.error('File-transfer download log error:', logError);
    }
  } catch (logError) {
    console.error('File-transfer download log error:', logError);
  }

  const response = new NextResponse(fileData as any);
  response.headers.set('Content-Type', file.mime_type || 'application/octet-stream');
  response.headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
  return response;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'admin' && user.role !== 'subadmin' && user.role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!verifyCsrfToken(request)) {
    return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
  }

  // 프론트에서 입력을 막아도 여기서 다시 검증한다.
  const { reason } = await request.json().catch(() => ({ reason: '' }));
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

  if (!trimmedReason) {
    return NextResponse.json({ error: '삭제 사유를 입력해주세요.' }, { status: 400 });
  }

  if (trimmedReason.length > REASON_MAX_LENGTH) {
    return NextResponse.json(
      { error: `삭제 사유는 ${REASON_MAX_LENGTH}자 이내로 입력해주세요.` },
      { status: 400 }
    );
  }

  const { id: fileId } = await params;

  const { data: file, error: queryError } = await loadQueuedUpload(fileId);
  if (queryError || !file) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  // 삭제 이력은 '원본파일 관리'와 같은 표에 남긴다 — 관리자가 삭제 히스토리
  // 화면 한 곳에서 전부 본다. Storage 실체는 지우지 않는다: 지우면 복구해도
  // storage_path가 가리키는 파일이 없어 다운로드가 깨진다.
  const { data: eventData, error: eventError } = await supabase
    .from('file_deletion_events')
    .insert({
      deleted_by: user.username,
      total_count: 1,
      reason: trimmedReason,
    })
    .select('id')
    .single();

  if (eventError || !eventData) {
    console.error('Failed to create deletion event:', eventError);
    return NextResponse.json({ error: '파일 삭제 이력 기록 실패' }, { status: 500 });
  }

  const { error: historyError } = await supabase.from('deleted_files').upsert(
    {
      id: file.id,
      name: file.name,
      size: file.size,
      storage_path: file.storage_path,
      department_id: file.department_id,
      is_original: file.is_original,
      original_file_id: file.original_file_id,
      mime_type: file.mime_type,
      uploaded_by: file.uploaded_by,
      uploaded_by_name: file.uploaded_by_name,
      uploaded_at: file.uploaded_at,
      deletion_event_id: eventData.id,
      file_content: file.file_content || [],
      // 복구하면 files로 되돌아간다. 출처를 안 남기면 파일전달에서 지운 파일이
      // 복구될 때 원본파일 관리 쪽으로 넘어가 버린다.
      source: file.source,
      restored_at: null,
    },
    { onConflict: 'id' }
  );

  if (historyError) {
    console.error('Failed to save deletion history:', historyError);
    return NextResponse.json({ error: '삭제 히스토리 저장에 실패했습니다.' }, { status: 500 });
  }

  // 2-1. 혹시 이 원본을 참조하는 배포 파일(자식 파일)이 있으면 연결을 끊고 severed_file_links에 기록
  const { data: children, error: childrenError } = await supabase
    .from('files')
    .select('id, original_file_id')
    .eq('original_file_id', fileId);

  if (childrenError) {
    console.error('Find linked distributed files error:', childrenError);
  }

  if (children && children.length > 0) {
    const { error: linkError } = await supabase.from('severed_file_links').insert(
      children.map((c) => ({
        deletion_event_id: eventData.id,
        file_id: c.id,
        original_file_id: c.original_file_id,
      }))
    );

    if (linkError) {
      console.error('Failed to record severed links in file-transfer delete:', linkError);
    }

    const { error: severError } = await supabase
      .from('files')
      .update({ original_file_id: null })
      .in(
        'id',
        children.map((c) => c.id)
      );

    if (severError) {
      console.error('Sever distributed link error in file-transfer delete:', severError);
    }
  }

  const { error: deleteError } = await supabase
    .from('files')
    .delete()
    .eq('id', fileId)
    .eq('is_original', true)
    .eq('source', 'file_transfer');

  if (deleteError) {
    console.error('File-transfer delete error:', deleteError);
    return NextResponse.json({ error: '파일 삭제에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, eventId: eventData.id });
}
