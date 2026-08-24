import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 원본 파일에 연결된 배포 파일을 조회한다.
// 목록 페이지의 현재 페이지만 훑으면 다른 페이지에 있는 배포 파일을 놓치므로
// 삭제 모달은 이 엔드포인트로 전체를 조회한다.
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 삭제 흐름에서만 쓰이므로 관리자만 조회한다.
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('originalFileIds') || '';
    const originalFileIds = raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (originalFileIds.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const { data, error } = await supabase
      .from('files')
      .select('id, name, department_id, original_file_id, departments(name)')
      .in('original_file_id', originalFileIds)
      .eq('is_original', false)
      // 같은 이름의 배포 파일이 여러 개다(배포할 때마다 생긴다). 이름만으로 정렬하면
      // 동점 행의 순서가 고정되지 않아, 페이지를 넘길 때 같은 행이 두 번 나오거나 빠진다.
      .order('name', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      throw error;
    }

    const files = (data || []).map((file: any) => ({
      id: file.id,
      name: file.name,
      originalFileId: file.original_file_id,
      department: file.departments?.name || '알 수 없음',
    }));

    return NextResponse.json({ data: files });
  } catch (error) {
    console.error('Distributed files fetch error:', error);
    return NextResponse.json({ error: '배포 파일을 불러올 수 없습니다.' }, { status: 500 });
  }
}
