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
    const sortBy = searchParams.get('sortBy') || 'downloaded_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc';
    const department = searchParams.get('department') || '';
    const fileId = searchParams.get('fileId') || '';

    const offset = (page - 1) * limit;

    // 총 개수 조회
    let countQuery = supabase
      .from('download_records')
      .select('*', { count: 'exact', head: true });

    if (search) {
      countQuery = countQuery.or(`file_name.ilike.%${search}%,downloaded_by.ilike.%${search}%`);
    }

    if (department) {
      countQuery = countQuery.eq('user_department', department);
    }

    // 특정 파일의 다운로드 이력만 조회할 때 사용한다.
    if (fileId) {
      countQuery = countQuery.eq('file_id', fileId);
    }

    const { count } = await countQuery;

    // 데이터 조회 (file_content 포함)
    let dataQuery = supabase
      .from('download_records')
      .select('id, file_id, file_name, downloaded_by, user_name, user_employee_id, user_department, downloaded_at, file_content');

    if (department) {
      dataQuery = dataQuery.eq('user_department', department);
    }

    if (fileId) {
      dataQuery = dataQuery.eq('file_id', fileId);
    }

    let { data, error } = await dataQuery.order(sortBy, { ascending: sortOrder });

    if (error) {
      console.error('Failed to fetch download history:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch download history',
        records: [],
        pagination: { page, limit, total: 0, pages: 0 }
      }, { status: 200 });
    }

    // 검색: 파일명, 다운로드자, file_content에서 모두 검색
    if (search && data) {
      const searchLower = search.toLowerCase();
      data = data.filter((record) => {
        // 파일명 또는 다운로드자로 검색
        if (record.file_name.toLowerCase().includes(searchLower) ||
            record.downloaded_by.toLowerCase().includes(searchLower)) {
          return true;
        }

        // file_content에서 검색
        if (!Array.isArray(record.file_content)) return false;
        return record.file_content.some((row: any) => {
          if (typeof row !== 'object' || row === null) return false;
          return Object.values(row).some((value) => {
            return String(value || '').toLowerCase().includes(searchLower);
          });
        });
      });
    }

    // 페이지네이션 적용
    const totalRecords = data?.length || 0;
    data = data?.slice(offset, offset + limit) || [];
    const totalPages = Math.ceil(totalRecords / limit);

    return NextResponse.json({
      success: true,
      records: data,
      pagination: {
        page,
        limit,
        total: totalRecords,
        pages: totalPages,
      },
    });
  } catch (error) {
    console.error('Download history error:', error);
    return NextResponse.json({ error: 'Failed to fetch download history' }, { status: 500 });
  }
}
