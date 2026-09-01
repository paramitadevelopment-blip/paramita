import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { hasHistoryAccess } from '@/lib/historyAccess';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const STORAGE_BUCKET = 'files';

// 삭제된 파일은 files 테이블에 없으므로 deleted_files의 storage_path로 직접 읽는다.
// 미리보기 전용이라 다운로드 기록은 남기지 않는다.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 히스토리 비밀번호를 통과한 세션만 허용한다.
    if (!hasHistoryAccess(request, user.id)) {
      return NextResponse.json({ error: '비밀번호 확인이 필요합니다.' }, { status: 403 });
    }

    const { id: fileId } = await params;

    const { data: file, error: queryError } = await supabase
      .from('deleted_files')
      .select('id, name, storage_path, mime_type')
      .eq('id', fileId)
      .single();

    if (queryError || !file) {
      return NextResponse.json({ error: '삭제 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!file.storage_path) {
      return NextResponse.json({ error: '파일 경로가 없습니다.' }, { status: 404 });
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(file.storage_path);

    if (downloadError || !fileData) {
      console.error('Deleted file download error:', downloadError);
      return NextResponse.json(
        { error: '파일 실체가 없어 미리보기를 할 수 없습니다.' },
        { status: 404 }
      );
    }

    const response = new NextResponse(fileData);
    response.headers.set('Content-Type', file.mime_type || 'application/octet-stream');
    response.headers.set(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(file.name)}"`
    );
    return response;
  } catch (error) {
    console.error('Deleted file preview error:', error);
    return NextResponse.json({ error: '미리보기에 실패했습니다.' }, { status: 500 });
  }
}
