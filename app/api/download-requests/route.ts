import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { checkUserFileDepartmentMatch } from '@/lib/files';
import { verifyCsrfToken } from '@/lib/csrf';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { parsePagination } from '@/lib/pagination';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// redownload_requests의 CHECK 제약과 같은 값이어야 한다.
const REASON_MAX_LENGTH = 500;

interface RedownloadRequest {
  id: number;
  file_id: string;
  user_id: number;
  file_name: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  user_name?: string;
  user_employee_id?: string;
  user_department?: string;
  reviewed_by_name?: string;
}

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can view requests' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const search = searchParams.get('search') || '';
    // 요청 한 건이 곧 이벤트다. 들어온 순서가 기본 정렬 기준이다.
    const sortBy = searchParams.get('sortBy') || 'requested_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc';
    const department = searchParams.get('department') || '';
    const status = searchParams.get('status') || ''; // 'pending' | 'approved' | 'rejected' | ''

    // user_name, file_reject_count는 이 테이블의 컬럼이 아니라 DB order로는 못 쓴다.
    // (넘기면 PostgREST가 없는 컬럼이라며 에러를 낸다.) 정렬은 아래에서 다시 한다.
    const DB_SORT_COLUMNS = ['requested_at', 'reviewed_at', 'status', 'file_name', 'id'];
    const dbSortBy = DB_SORT_COLUMNS.includes(sortBy) ? sortBy : 'requested_at';

    // 요청자 정보는 요청 시점에 복사해 둔 값을 쓴다. users를 조인하면 그 사람이
    // 삭제됐을 때 행이 통째로 빠지거나(inner) 이름이 비어(left) 이력이 반쪽이 된다.
    // 소속 필터도 복사본을 보므로 조인 없이 부모 행을 곧장 거른다.
    const buildQuery = () => {
      let query = supabase
        .from('redownload_requests')
        .select(
          `id, file_id, user_id, file_name, status, requested_at, reviewed_by, reviewed_at,
           reason, review_reason, username, user_name, user_employee_id, user_department,
           reviewed_by_name`,
          { count: 'exact' }
        );

      if (status && ['pending', 'approved', 'rejected'].includes(status)) {
        query = query.eq('status', status);
      }

      if (department) {
        query = query.eq('user_department', department);
      }

      return query.order(dbSortBy, { ascending: sortOrder });
    };

    let { data: requests, error } = await fetchAllRows<any>(buildQuery);

    if (error) {
      console.error('Failed to fetch requests:', error);
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch requests',
        records: [],
        pagination: { page, limit, total: 0, pages: 0 }
      });
    }

    // Apply search filter
    if (search && requests) {
      const searchLower = search.toLowerCase();
      requests = requests.filter((req: any) => {
        return (
          req.file_name.toLowerCase().includes(searchLower) ||
          req.user_name?.toLowerCase().includes(searchLower) ||
          req.username?.toLowerCase().includes(searchLower) ||
          req.user_employee_id?.toLowerCase().includes(searchLower)
        );
      });
    }

    // 이 파일이 지금까지 몇 번 거부됐는지. 목록에는 상태 필터가 걸려 있어서
    // 조회된 행만으로는 셀 수 없으므로 파일 id로 따로 집계한다.
    // 이 값으로 정렬도 하므로 페이지를 자르기 전에 구해야 한다.
    const allFileIds = Array.from(new Set((requests || []).map((req: any) => req.file_id)));
    const rejectCountByFile: Record<string, number> = {};
    if (allFileIds.length > 0) {
      const { data: rejected } = await fetchAllRows<any>(() =>
        supabase
          .from('redownload_requests')
          .select('file_id', { count: 'exact' })
          .in('file_id', allFileIds)
          .eq('status', 'rejected')
      );

      (rejected || []).forEach((r: any) => {
        rejectCountByFile[r.file_id] = (rejectCountByFile[r.file_id] || 0) + 1;
      });
    }

    // DB에서 못 건 정렬을 여기서 처리한다.
    if (sortBy === 'file_reject_count') {
      (requests || []).sort((a: any, b: any) => {
        const diff = (rejectCountByFile[a.file_id] || 0) - (rejectCountByFile[b.file_id] || 0);
        return sortOrder ? diff : -diff;
      });
    } else if (sortBy === 'user_name') {
      (requests || []).sort((a: any, b: any) => {
        const aName = a.username || '';
        const bName = b.username || '';
        return sortOrder
          ? aName.localeCompare(bName, 'ko-KR')
          : bName.localeCompare(aName, 'ko-KR');
      });
    }

    const totalRecords = requests?.length || 0;
    const sliced = (requests || []).slice(offset, offset + limit);
    const totalPages = Math.ceil(totalRecords / limit);

    // 처리자 이름도 처리 시점에 저장해 둔 값을 쓴다. 조회로 붙이면 그 관리자가
    // 삭제됐을 때 "누가 승인했는지"가 사라진다.

    // Flatten and map response
    const records = sliced.map((req: any) => ({
      id: req.id,
      file_id: req.file_id,
      user_id: req.user_id,
      file_name: req.file_name,
      file_reject_count: rejectCountByFile[req.file_id] || 0,
      status: req.status,
      requested_at: req.requested_at,
      reason: req.reason || null,
      review_reason: req.review_reason || null,
      reviewed_by: req.reviewed_by,
      reviewed_at: req.reviewed_at,
      reviewed_by_name: req.reviewed_by_name || null,
      user_username: req.username || null,
      user_name: req.user_name || null,
      user_employee_id: req.user_employee_id || null,
      user_department: req.user_department || null,
    }));

    return NextResponse.json({
      success: true,
      records,
      pagination: { page, limit, total: totalRecords, pages: totalPages }
    });
  } catch (error) {
    console.error('Download requests error:', error);
    return NextResponse.json({ error: 'Failed to fetch download requests' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role === 'admin') {
      return NextResponse.json(
        { error: 'Admin users do not need to request re-downloads' },
        { status: 400 }
      );
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await request.json();
    const { fileId, reason } = body;

    if (!fileId) {
      return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
    }

    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';

    if (!trimmedReason) {
      return NextResponse.json({ error: '재다운로드 사유는 필수입니다.' }, { status: 400 });
    }

    // DB CHECK와 같은 한도. 여기서 걸러야 제약 위반이 500으로 새어 나가지 않는다.
    if (trimmedReason.length > REASON_MAX_LENGTH) {
      return NextResponse.json(
        { error: `재다운로드 사유는 ${REASON_MAX_LENGTH}자 이하로 입력해주세요.` },
        { status: 400 }
      );
    }

    // 1. Check department match
    const deptCheck = await checkUserFileDepartmentMatch(user.id, fileId);
    if (!deptCheck.success) {
      return NextResponse.json({ error: deptCheck.error }, { status: 403 });
    }

    // 2. Get file info (name, check if it's original)
    const { data: file } = await supabase
      .from('files')
      .select('id, name, is_original')
      .eq('id', fileId)
      .single();

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (file.is_original) {
      return NextResponse.json({ error: 'Cannot request re-download for original files' }, { status: 400 });
    }

    // 3. Check if user already has a pending request for this file
    const { data: existingPending } = await supabase
      .from('redownload_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('file_id', fileId)
      .eq('status', 'pending')
      .single();

    if (existingPending) {
      return NextResponse.json(
        { error: 'You already have a pending request for this file' },
        { status: 400 }
      );
    }

    // 4. Check if user is still within the allowed download count (hasn't reached limit yet)
    const { data: downloadCounts } = await supabase
      .from('download_records')
      .select('id', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('file_id', fileId);

    const downloadCount = downloadCounts?.length || 0;

    const { data: approvedRequests } = await supabase
      .from('redownload_requests')
      .select('id', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('file_id', fileId)
      .eq('status', 'approved');

    const approvedCount = approvedRequests?.length || 0;
    const allowed = 1 + approvedCount;

    if (downloadCount < allowed) {
      return NextResponse.json(
        { error: 'You can still download this file without requesting approval' },
        { status: 400 }
      );
    }

    // 5. Create the request
    // 요청자 정보는 지금 값을 복사해 둔다. users를 조인해서 읽으면 나중에 그 사람이
    // 삭제될 때 요청 이력에서 "누가 냈는지"가 통째로 비어버린다.
    const { data: requester } = await supabase
      .from('users')
      .select('username, name, employee_id, department')
      .eq('id', user.id)
      .single();

    const { data: newRequest, error: insertError } = await supabase
      .from('redownload_requests')
      .insert({
        file_id: fileId,
        user_id: user.id,
        file_name: file.name,
        status: 'pending',
        reason: trimmedReason,
        username: requester?.username || user.username,
        user_name: requester?.name || null,
        user_employee_id: requester?.employee_id || null,
        user_department: requester?.department || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create request:', insertError);
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Request created successfully',
      request: newRequest
    }, { status: 201 });
  } catch (error) {
    console.error('Download request creation error:', error);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}
