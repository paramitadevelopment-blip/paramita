import { NextRequest, NextResponse } from 'next/server';
import { isAdminRole } from '@/lib/roles';
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

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const search = searchParams.get('search') || '';
    const sortByParam = searchParams.get('sortBy') || 'uploaded_at';
    const sortOrder = searchParams.get('sortOrder') || 'desc';
    // department는 배정 분류 하나('파라인슈1'), departmentGroup은 조직 전체('파라인슈').
    // 둘을 한 파라미터로 받으면 서버가 어느 쪽인지 추측해야 하므로 나눠서 받는다.
    const department = searchParams.get('department') || '';
    const departmentGroup = searchParams.get('departmentGroup') || '';
    const showOriginal = searchParams.get('showOriginal') === 'true';
    const statusFilter = searchParams.get('status') || '';

    // sortBy를 그대로 .order()에 넘기면 클라이언트가 정렬 대상을 마음대로 고른다.
    // 목록에 실제로 있는 컬럼만 허용한다.
    const SORTABLE = [
      'name',
      'size',
      'uploaded_at',
      'uploaded_by_name',
      'download_count',
      'department_id',
      'myDownloadStatus',
      'myRejectCount',
    ];
    const sortBy = SORTABLE.includes(sortByParam) ? sortByParam : 'uploaded_at';
    const isAdmin = isAdminRole(user.role);

    // 일반 사용자는 본인 소속 파일만 볼 수 있음
    let userDepartment: string | null = null;
    if (!isAdmin) {
      const { data: userData } = await supabase
        .from('users')
        .select('department')
        .eq('id', user.id)
        .single();

      userDepartment = userData?.department || null;
    }

    // 소속별 필터링.
    // 한 그룹이 여러 분류로 나뉠 수 있어(파라인슈 = 파라인슈1 + 파라인슈2)
    // 대상 소속은 항상 배열로 다룬다. 1:1인 소속은 원소가 하나라 동작이 전과 같다.
    let departmentIds: number[] = [];

    // 비관리자는 본인 조직 전체를 본다. 관리자는 하위 분류 하나를 콕 집을 수도 있다.
    const filterName = isAdmin ? department : '';
    const filterGroup = isAdmin ? departmentGroup : userDepartment;

    if (filterName) {
      const { data: dept } = await supabase
        .from('departments')
        .select('id')
        .eq('name', filterName)
        .single();

      departmentIds = dept ? [dept.id] : [];
    } else if (filterGroup) {
      const { data: depts } = await supabase
        .from('departments')
        .select('id')
        .eq('group_name', filterGroup);

      departmentIds = (depts || []).map((d) => d.id);
    }

    // 비관리자는 소속이 확정돼야만 조회할 수 있다. 소속을 못 가리는데 그냥 넘어가면
    // 아래 필터가 안 걸려 전체 파일이 나간다. 막는 쪽이 기본이어야 한다.
    if (!isAdmin && departmentIds.length === 0) {
      return NextResponse.json({
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }

    // 전체 개수는 나중에 필터링 후 계산
    let countTotal = 0;

    // myDownloadStatus·myRejectCount는 DB 컬럼이 아니라 아래에서 계산하는 값이라
    // DB order에 넘길 수 없다. (넘기면 PostgREST가 없는 컬럼이라며 에러를 낸다.)
    // 여기서는 기본 정렬만 걸고, 그 값들로 하는 정렬은 계산한 뒤 아래에서 다시 한다.
    const CALCULATED_SORT_KEYS = ['myDownloadStatus', 'myRejectCount'];
    const dbSortBy = CALCULATED_SORT_KEYS.includes(sortBy) ? 'uploaded_at' : sortBy;

    // 파일 조회 (file_content 포함)
    const buildFileQuery = () => {
      let fileQuery = supabase
        .from('files')
        .select(
          'id, name, size, uploaded_at, uploaded_by, uploaded_by_name, download_count, departments(name), is_original, original_file_id, file_content',
          { count: 'exact' }
        );

      // 원본 파일은 관리자 전용이다. 지금은 원본이 관리자 소속(15)이라 아래 소속
      // 필터에 우연히 걸리지만, 규칙을 우연에 기대면 소속이 바뀌는 순간 열린다.
      if (!isAdmin) {
        fileQuery = fileQuery.eq('is_original', false);
      } else if (searchParams.has('showOriginal')) {
        fileQuery = fileQuery.eq('is_original', showOriginal);
      }

      /*
       * 원본파일 관리에는 파일전달 대기열을 섞지 않는다.
       *
       * 둘은 같은 files 표를 쓰지만 다른 화면, 다른 개념이다. 파일전달은 아직
       * 관리자가 손대지 않은 접수함이고, 원본파일 관리는 관리자가 올려 처리한
       * 원본의 이력이다. 걸러내지 않으면 파일전달에 올린 순간 배포 전인데도
       * 원본파일 관리에 뜨고, 한쪽에서 지우면 다른 쪽에서도 사라진다.
       * 배포본(is_original=false)은 애초에 파일전달과 무관하다.
       */
      if (showOriginal) {
        fileQuery = fileQuery.eq('source', 'direct');
      }

      if (departmentIds.length > 0) {
        fileQuery = fileQuery.in('department_id', departmentIds);
      }

      // 같은 배포에서 나온 파일들은 uploaded_at이 마이크로초까지 같다. 동점일 때
      // 순서를 정해주지 않으면 DB가 행을 물리적으로 놓인 순서대로 돌려주는데,
      // 그 위치는 행을 고칠 때마다 바뀐다. 다운로드하면 download_count가 올라가므로
      // 바로 그 순간 순서가 뒤집혀, 방금 누른 줄이 아니라 옆줄이 바뀐 것처럼 보인다.
      // (파라인슈1·2처럼 한 사용자에게 두 파일이 같이 보이는 소속에서 특히 그렇다.)
      return fileQuery
        .order(dbSortBy, { ascending: sortOrder === 'asc' })
        .order('id', { ascending: true });
    };

    let { data: allFiles, error } = await fetchAllRows<any>(buildFileQuery);

    if (error) {
      throw error;
    }

    // 검색 대상.
    //
    // 엑셀 내용은 관리자만 검색한다. 비관리자는 파일명까지다.
    //
    // 응답에 내용을 실어 보내지는 않지만, 걸리느냐 안 걸리느냐로 "그 값이 이 파일에
    // 있다"는 사실이 새어 나간다. 고객명을 넣어보면 다운로드하지 않고도 그 고객이
    // 자기 소속 파일에 있는지 알 수 있다. 다운로드는 1회로 묶여 있고 기록도 남는데
    // 검색은 둘 다 거치지 않으므로, 열어두면 그 장치들이 무의미해진다.
    let files = allFiles || [];
    if (search) {
      const searchLower = search.toLowerCase();
      const searchContent = isAdmin;

      files = files.filter((file) => {
        if (file.name.toLowerCase().includes(searchLower)) return true;
        if (!searchContent) return false;

        // 업로드한 사람 이름도 관리자에게만 보이는 값이라(FileTable의 admin 전용
        // 열과 같은 기준) 내용 검색과 같이 관리자 전용으로 묶는다.
        if (String(file.uploaded_by_name ?? '').toLowerCase().includes(searchLower)) return true;

        if (!Array.isArray(file.file_content)) return false;
        return file.file_content.some((row: any) => {
          if (typeof row !== 'object' || row === null) return false;
          return Object.values(row).some((value) =>
            String(value || '').toLowerCase().includes(searchLower)
          );
        });
      });
    }

    // file_content는 위 검색에만 쓰는 서버 전용 데이터다. 엑셀 전체가 들어 있어
    // (고객명·연락처·주소) 목록 응답에 실어 보낼 이유가 없다.
    let data: any[] = files.map(({ file_content, ...file }) => file);

    // 비관리자용 다운로드 상태 계산: 각 파일에 대해 이 유저가 지금 받을 수 있는지 판단.
    // 상태 필터·정렬과 총 건수가 서로 맞으려면 페이지를 자르기 "전에" 전체를 대상으로 계산해야 한다.
    if (!isAdmin && userDepartment) {
      const fileIds = data.map((f: any) => f.id);

      if (fileIds.length > 0) {
        // 이 페이지의 각 파일에 대해 유저의 다운로드 기록 조회
        const { data: allDownloads } = await fetchAllRows<any>(() =>
          supabase
            .from('download_records')
            .select('file_id', { count: 'exact' })
            .eq('user_id', user.id)
            .in('file_id', fileIds)
        );

        const downloadsByFile: Record<string, number> = {};
        (allDownloads || []).forEach((record: any) => {
          downloadsByFile[record.file_id] = (downloadsByFile[record.file_id] || 0) + 1;
        });

        // 재다운로드 요청은 거부돼도 다시 낼 수 있어 파일당 여러 건이 쌓인다.
        // 승인 횟수·대기 여부·마지막 결과를 한 번에 봐야 하므로 통째로 가져와서 메모리에서 접는다.
        const { data: allRequests } = await fetchAllRows<any>(() =>
          supabase
            .from('redownload_requests')
            .select('file_id, status, requested_at, review_reason', { count: 'exact' })
            .eq('user_id', user.id)
            .in('file_id', fileIds)
            .order('requested_at', { ascending: false })
        );

        const approvedByFile: Record<string, number> = {};
        const rejectedByFile: Record<string, number> = {};
        const hasPendingByFile: Record<string, boolean> = {};
        const requestCountByFile: Record<string, number> = {};
        // 내림차순으로 받았으므로 파일별 첫 번째가 가장 최근 요청이다.
        const latestByFile: Record<string, any> = {};

        (allRequests || []).forEach((req: any) => {
          requestCountByFile[req.file_id] = (requestCountByFile[req.file_id] || 0) + 1;
          if (req.status === 'approved') {
            approvedByFile[req.file_id] = (approvedByFile[req.file_id] || 0) + 1;
          }
          if (req.status === 'rejected') {
            rejectedByFile[req.file_id] = (rejectedByFile[req.file_id] || 0) + 1;
          }
          if (req.status === 'pending') {
            hasPendingByFile[req.file_id] = true;
          }
          if (!latestByFile[req.file_id]) {
            latestByFile[req.file_id] = req;
          }
        });

        // 각 파일의 상태 계산
        data = data.map((file: any) => {
          const downloadCount = downloadsByFile[file.id] || 0;
          const approvedCount = approvedByFile[file.id] || 0;
          const allowed = 1 + approvedCount;
          const hasPending = hasPendingByFile[file.id] || false;
          const latest = latestByFile[file.id];

          let myDownloadStatus: 'available' | 'downloaded' | 'pending_request' | 'rejected';
          if (hasPending) {
            myDownloadStatus = 'pending_request';
          } else if (downloadCount >= allowed) {
            // 한도를 다 썼는데 마지막 요청이 거부된 상태라면 그 사실을 그대로 보여준다.
            // 거부돼도 다시 요청할 수 있으므로 동작은 'downloaded'와 같다.
            myDownloadStatus = latest?.status === 'rejected' ? 'rejected' : 'downloaded';
          } else {
            myDownloadStatus = 'available';
          }

          return {
            ...file,
            myDownloadStatus,
            myLastRejectReason: myDownloadStatus === 'rejected' ? latest?.review_reason || null : null,
            myRequestCount: requestCountByFile[file.id] || 0,
            myRejectCount: rejectedByFile[file.id] || 0,
          };
        });

        // 상태 필터 (비관리자 전용). 서버에서 걸러야 총 건수·페이지 수가 맞는다.
        if (['available', 'downloaded', 'pending_request', 'rejected'].includes(statusFilter)) {
          data = data.filter((file: any) => file.myDownloadStatus === statusFilter);
        }

        // 상태순 정렬. DB 컬럼이 아니라 여기서 계산한 값이므로 DB order로는 못 한다.
        if (sortBy === 'myDownloadStatus') {
          const statusOrder: Record<string, number> = {
            available: 0,
            downloaded: 1,
            rejected: 2,
            pending_request: 3,
          };
          data.sort((a: any, b: any) => {
            const diff = (statusOrder[a.myDownloadStatus] ?? 999) - (statusOrder[b.myDownloadStatus] ?? 999);
            return sortOrder === 'asc' ? diff : -diff;
          });
        }

        // 거부 횟수 정렬. 위와 같은 이유로 여기서 처리한다.
        if (sortBy === 'myRejectCount') {
          data.sort((a: any, b: any) => {
            const diff = (a.myRejectCount || 0) - (b.myRejectCount || 0);
            return sortOrder === 'asc' ? diff : -diff;
          });
        }
      }
    }

    // 필터링된 전체 개수 (페이지네이션 전에 계산)
    countTotal = data.length;

    // 페이지네이션 적용
    data = data.slice(offset, offset + limit);

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
