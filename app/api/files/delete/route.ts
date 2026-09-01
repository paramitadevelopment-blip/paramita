import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
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

    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { fileIds, deleteDistributedFiles = false, reason } = await request.json();

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json({ error: 'No files to delete' }, { status: 400 });
    }

    // 프론트에서 입력을 막아도 여기서 다시 검증한다.
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

    if (!trimmedReason) {
      return NextResponse.json({ error: '삭제 사유를 입력해주세요.' }, { status: 400 });
    }

    if (trimmedReason.length > 500) {
      return NextResponse.json(
        { error: '삭제 사유는 500자 이내로 입력해주세요.' },
        { status: 400 }
      );
    }

    // 파일 메타데이터 조회
    const { data: files, error: queryError } = await supabase
      .from('files')
      .select('id, storage_path, is_original')
      .in('id', fileIds);

    if (queryError) {
      throw queryError;
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Files not found' }, { status: 404 });
    }

    const originalFileIds = files.filter((f) => f.is_original).map((f) => f.id);

    // 요청받은 파일은 항상 삭제한다.
    // deleteDistributedFiles가 true일 때만 원본에 연결된 배포 파일까지 확장한다.
    const idsToDelete = new Set(files.map((f) => f.id));

    if (deleteDistributedFiles && originalFileIds.length > 0) {
      const { data: linkedDistributedFiles, error: linkedError } = await supabase
        .from('files')
        .select('id')
        .in('original_file_id', originalFileIds);

      if (linkedError) {
        console.error('Error finding linked distributed files:', linkedError);
      }

      linkedDistributedFiles?.forEach((f) => idsToDelete.add(f.id));
    }

    const allFilesToDelete = Array.from(idsToDelete);

    // 빈 배열을 .in()에 넘기면 필터가 무시되어 전체 행이 삭제되므로 반드시 막는다.
    if (allFilesToDelete.length === 0) {
      return NextResponse.json({ error: 'No files to delete' }, { status: 400 });
    }

    // 메타데이터는 연결을 끊기 전에 읽어야 original_file_id가 보존된다.
    // file_content도 함께 읽어서 삭제 히스토리에 저장한다.
    const { data: allFiles, error: allFilesError } = await supabase
      .from('files')
      .select('id, name, size, storage_path, department_id, is_original, original_file_id, mime_type, uploaded_by, uploaded_by_name, uploaded_at, file_content, source')
      .in('id', allFilesToDelete);

    if (allFilesError) {
      throw allFilesError;
    }

    // 원본은 지우지만 남겨두는 배포 파일을 찾는다.
    // 이들만 연결을 끊어야 하며, 함께 삭제되는 배포 파일은 건드리면 안 된다.
    let keptChildren: Array<{ id: string; original_file_id: string }> = [];

    if (originalFileIds.length > 0) {
      const { data: children, error: childrenError } = await supabase
        .from('files')
        .select('id, original_file_id')
        .in('original_file_id', originalFileIds);

      if (childrenError) {
        console.error('Find linked distributed files error:', childrenError);
      }

      keptChildren = (children || []).filter((c) => !idsToDelete.has(c.id)) as Array<{
        id: string;
        original_file_id: string;
      }>;
    }

    // 1. 삭제 이벤트 생성 (히스토리)
    const { data: eventData, error: eventError } = await supabase
      .from('file_deletion_events')
      .insert({
        deleted_by: user.username,
        total_count: allFilesToDelete.length,
        reason: trimmedReason,
      })
      .select('id')
      .single();

    if (eventError || !eventData) {
      console.error('Failed to create deletion event:', eventError);
      return NextResponse.json({ error: '파일 삭제 이력 기록 실패' }, { status: 500 });
    }

    // 2. 삭제된 파일 메타데이터를 deleted_files에 복사 (file_content 포함)
    const deletedFilesRecords = (allFiles || []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      storage_path: f.storage_path,
      department_id: f.department_id,
      is_original: f.is_original,
      original_file_id: f.original_file_id,
      mime_type: f.mime_type,
      // files 쪽이 NOT NULL이라 복구할 때 되돌리려면 반드시 보존해야 한다.
      uploaded_by: f.uploaded_by,
      uploaded_by_name: f.uploaded_by_name,
      uploaded_at: f.uploaded_at,
      deletion_event_id: eventData.id,
      file_content: f.file_content || [],
      // 복구하면 files로 되돌아가므로 출처도 같이 보존한다.
      source: f.source,
      restored_at: null,
    }));

    if (deletedFilesRecords.length > 0) {
      const { error: historyError } = await supabase
        .from('deleted_files')
        .upsert(deletedFilesRecords, { onConflict: 'id' });

      if (historyError) {
        console.error('Failed to save deletion history:', historyError);
        return NextResponse.json(
          { error: '삭제 히스토리 저장에 실패했습니다.' },
          { status: 500 }
        );
      }
    }

    // 2-1. 남겨두는 배포 파일은 연결을 끊되, 복구 때 되살리도록 기록해 둔다.
    if (keptChildren.length > 0) {
      const { error: linkError } = await supabase.from('severed_file_links').insert(
        keptChildren.map((c) => ({
          deletion_event_id: eventData.id,
          file_id: c.id,
          original_file_id: c.original_file_id,
        }))
      );

      if (linkError) {
        console.error('Failed to record severed links:', linkError);
      }

      const { error: severError } = await supabase
        .from('files')
        .update({ original_file_id: null })
        .in(
          'id',
          keptChildren.map((c) => c.id)
        );

      if (severError) {
        console.error('Sever distributed link error:', severError);
      }
    }

    // Storage 실체는 지우지 않는다.
    // 지우면 복구해도 storage_path가 가리키는 파일이 없어 다운로드가 깨진다.
    // 용량 회수는 히스토리를 영구 삭제할 때 별도로 처리한다.

    // 3. DB에서 파일 메타데이터 삭제
    const { error: deleteDbError } = await supabase
      .from('files')
      .delete()
      .in('id', allFilesToDelete);

    if (deleteDbError) {
      console.error('Database delete error:', deleteDbError);
      return NextResponse.json({ error: '파일 삭제에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deletedCount: allFilesToDelete.length,
      eventId: eventData.id,
    });
  } catch (error) {
    console.error('File delete error:', error);
    return NextResponse.json({ error: '파일 삭제에 실패했습니다.' }, { status: 500 });
  }
}
