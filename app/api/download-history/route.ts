import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { parsePagination } from '@/lib/pagination';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 다운로드 로그는 전 사용자의 기록이라 관리자 전용이다.
    // 사이드바에서 링크를 숨기는 건 UX일 뿐이고, 실제 차단은 여기서 한다.
    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ error: 'Only admin can view download history' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const search = searchParams.get('search') || '';
    const sortByParam = searchParams.get('sortBy') || 'downloaded_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc';
    const department = searchParams.get('department') || '';
    const fileId = searchParams.get('fileId') || '';

    // sortBy를 그대로 .order()에 넘기면 클라이언트가 정렬 대상을 마음대로 고른다.
    const SORTABLE = [
      'downloaded_at',
      'file_name',
      'downloaded_by',
      'user_name',
      'user_employee_id',
      'user_department',
      'ip_address',
      'device_type',
      'os_name',
      'browser_name',
    ];
    const sortBy = SORTABLE.includes(sortByParam) ? sortByParam : 'downloaded_at';

    // 화면에 내보내는 열. file_content는 여기 없다 — 엑셀 전체(고객명·연락처·주소)라
    // 응답에 실어 보내면 안 되고, 검색할 때만 서버에서 쓰고 버린다.
    const LIST_COLUMNS =
      'id, file_id, file_name, downloaded_by, user_name, user_employee_id, user_department, downloaded_at, ip_address, device_type, os_name, browser_name';

    // 공통 조건. 검색 여부와 상관없이 같은 필터가 걸려야 건수와 목록이 어긋나지 않는다.
    const applyFilters = (query: any) => {
      let q = query;
      if (department) q = q.eq('user_department', department);
      // 특정 파일의 다운로드 이력만 조회할 때 사용한다.
      if (fileId) q = q.eq('file_id', fileId);
      // 동점이면 순서가 고정되지 않아 페이지를 넘길 때 행이 중복되거나 빠진다.
      return q.order(sortBy, { ascending: sortOrder }).order('id', { ascending: false });
    };

    let records: any[];
    let totalRecords: number;

    if (search) {
      // 검색은 파일명·다운로드자뿐 아니라 엑셀 내용 안까지 훑는다. DB로는 못 거르므로
      // 전부 가져와 메모리에서 판정할 수밖에 없다. 대신 이 경로는 검색할 때만 탄다.
      const { data, error } = await fetchAllRows<any>(() =>
        applyFilters(
          supabase
            .from('download_records')
            .select(`${LIST_COLUMNS}, file_content`, { count: 'exact' })
        )
      );

      if (error) {
        console.error('Failed to fetch download history:', error);
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch download history',
          records: [],
          pagination: { page, limit, total: 0, pages: 0 }
        }, { status: 200 });
      }

      const searchLower = search.toLowerCase();
      const matched = (data || []).filter((record: any) => {
        if (record.file_name.toLowerCase().includes(searchLower) ||
            record.downloaded_by.toLowerCase().includes(searchLower)) {
          return true;
        }

        if (!Array.isArray(record.file_content)) return false;
        return record.file_content.some((row: any) => {
          if (typeof row !== 'object' || row === null) return false;
          return Object.values(row).some((value) =>
            String(value || '').toLowerCase().includes(searchLower)
          );
        });
      });

      totalRecords = matched.length;
      // 검색이 끝났으니 file_content는 걷어낸다.
      records = matched
        .slice(offset, offset + limit)
        .map(({ file_content, ...record }: any) => record);
    } else {
      // 목록만 보는 경우 — 대부분이 여기다. 자르기·개수 세기를 DB에 맡기고
      // 이 페이지에 필요한 만큼만 받는다. file_content는 아예 가져오지 않는다.
      const { data, error, count } = await applyFilters(
        supabase.from('download_records').select(LIST_COLUMNS, { count: 'exact' })
      ).range(offset, offset + limit - 1);

      if (error) {
        console.error('Failed to fetch download history:', error);
        return NextResponse.json({
          success: false,
          error: 'Failed to fetch download history',
          records: [],
          pagination: { page, limit, total: 0, pages: 0 }
        }, { status: 200 });
      }

      records = data || [];
      totalRecords = count || 0;
    }

    const totalPages = Math.ceil(totalRecords / limit);

    return NextResponse.json({
      success: true,
      records,
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
