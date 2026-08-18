import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'uploaded_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    const department = searchParams.get('department') || '';
    const showOriginal = searchParams.get('showOriginal') === 'true';

    const offset = (page - 1) * limit;

    // 일반 사용자는 본인 소속 파일만 볼 수 있음
    let userDepartment: string | null = null;
    if (user.role !== 'admin') {
      const { data: userData } = await supabase
        .from('users')
        .select('department')
        .eq('id', user.id)
        .single();

      userDepartment = userData?.department || null;
    }

    // 소속별 필터링
    let departmentId: number | null = null;
    const filterDepartment = user.role === 'admin' ? department : userDepartment;

    if (filterDepartment) {
      const { data: dept } = await supabase
        .from('departments')
        .select('id')
        .eq('name', filterDepartment)
        .single();

      departmentId = dept?.id || null;
    }

    // 전체 개수는 나중에 필터링 후 계산
    let countTotal = 0;

    // 파일 조회 (file_content 포함)
    let fileQuery = supabase
      .from('files')
      .select('id, name, size, uploaded_at, uploaded_by, download_count, departments(name), is_original, original_file_id, file_content');

    // showOriginal이 명시되면 필터링, 없으면 모든 파일 조회
    if (searchParams.has('showOriginal')) {
      if (showOriginal) {
        fileQuery = fileQuery.eq('is_original', true);
      } else {
        fileQuery = fileQuery.eq('is_original', false);
      }
    }

    if (departmentId) {
      fileQuery = fileQuery.eq('department_id', departmentId);
    }

    let { data: allFiles, error } = await fileQuery.order(sortBy, { ascending: sortOrder === 'asc' });

    // 검색: 파일명 또는 file_content에서 검색
    let files = allFiles || [];
    if (search) {
      const searchLower = search.toLowerCase();
      files = files.filter((file) => {
        // 파일명 검색
        if (file.name.toLowerCase().includes(searchLower)) return true;

        // file_content 검색
        if (!Array.isArray(file.file_content)) return false;
        return file.file_content.some((row: any) => {
          if (typeof row !== 'object' || row === null) return false;
          return Object.values(row).some((value) => {
            return String(value || '').toLowerCase().includes(searchLower);
          });
        });
      });
    }

    // 페이지네이션 적용
    files = files.slice(offset, offset + limit);

    if (error) {
      throw error;
    }

    // 필터링된 전체 개수
    countTotal = files.length;

    return NextResponse.json({
      data: files,
      pagination: {
        page,
        limit,
        total: countTotal,
        totalPages: Math.ceil(countTotal / limit),
      },
    });
  } catch (error) {
    console.error('Files list error:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
}
