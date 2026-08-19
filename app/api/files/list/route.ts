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

    // 비관리자는 소속이 확정돼야만 조회할 수 있다. 소속을 못 가리는데 그냥 넘어가면
    // 아래 필터가 안 걸려 전체 파일이 나간다. 막는 쪽이 기본이어야 한다.
    if (user.role !== 'admin' && !departmentId) {
      return NextResponse.json({
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }

    // 전체 개수는 나중에 필터링 후 계산
    let countTotal = 0;

    // 파일 조회 (file_content 포함)
    let fileQuery = supabase
      .from('files')
      .select('id, name, size, uploaded_at, uploaded_by, download_count, departments(name), is_original, original_file_id, file_content');

    // 원본 파일은 관리자 전용이다. 지금은 원본이 관리자 소속(15)이라 아래 소속
    // 필터에 우연히 걸리지만, 규칙을 우연에 기대면 소속이 바뀌는 순간 열린다.
    if (user.role !== 'admin') {
      fileQuery = fileQuery.eq('is_original', false);
    } else if (searchParams.has('showOriginal')) {
      fileQuery = fileQuery.eq('is_original', showOriginal);
    }

    if (departmentId) {
      fileQuery = fileQuery.eq('department_id', departmentId);
    }

    let { data: allFiles, error } = await fileQuery.order(sortBy, { ascending: sortOrder === 'asc' });

    if (error) {
      throw error;
    }

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

    // 필터링된 전체 개수 (페이지네이션 전에 계산)
    countTotal = files.length;

    // 페이지네이션 적용
    files = files.slice(offset, offset + limit);

    // file_content는 위 검색에만 쓰는 서버 전용 데이터다. 엑셀 전체가 들어 있어
    // (고객명·연락처·주소) 목록 응답에 실어 보낼 이유가 없다.
    const data = files.map(({ file_content, ...file }) => file);

    return NextResponse.json({
      data,
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
