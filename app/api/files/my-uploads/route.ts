import { NextRequest, NextResponse } from 'next/server';
import { canUseFileTransfer } from '@/lib/roles';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { parsePagination } from '@/lib/pagination';
import { fetchAllRows } from '@/lib/fetchAllRows';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 파일전달로 올린 원본 목록. 관리자·DB담당자 전원이 같은 목록을 본다.
 *
 * '누가 올렸는지'로 나눌 이유가 없다 — 아직 분류·배포 전이라, 누가 올렸든
 * 관리자가 골라 분류하기 전까지는 모두가 봐야 할 같은 대기열이다. 본인
 * 것만 걸렀다면 관리자와 DB담당자가 서로 다른(자기 계정 것만) 목록을 보게
 * 되어 "관리자는 무조건 다 된다"는 원칙과 어긋난다.
 * 지사는 이 화면 자체가 없다(소속으로 거르는 files/list와 다르다 — 여기는
 * 받는 부서가 아니라 아직 분류 안 된 원본 대기열이다).
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canUseFileTransfer(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );

    // sortBy를 그대로 .order()에 넘기면 클라이언트가 정렬 대상을 마음대로 고른다.
    // 목록에 실제로 있는 컬럼만 허용한다.
    const SORTABLE = ['name', 'size', 'uploaded_at', 'uploaded_by_name'];
    const sortByParam = searchParams.get('sortBy') || 'uploaded_at';
    const sortBy = SORTABLE.includes(sortByParam) ? sortByParam : 'uploaded_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc';

    const search = (searchParams.get('search') || '').trim().slice(0, 100);

    // 파일전달로 들어온 원본만 본다. 관리자가 파일업로드에서 직접 올린 원본은
    // 원본파일 관리 쪽 것이라 여기 섞이면 안 된다 — 두 화면이 같은 행을 보고
    // 있었기 때문에, 한쪽에 올리면 다른 쪽에도 뜨고 한쪽에서 지우면 양쪽에서
    // 사라졌다.
    //
    // 검색은 파일명뿐 아니라 엑셀 내용(고객명·주문번호·상품명·전화번호 등)까지
    // 본다. 파일전달 대기열은 아직 분류 전이라 어떤 파일에 어떤 신청 건이
    // 들어 있는지 파일명만 보고는 알 수 없다 — 관리자·DB담당자가 특정 고객
    // 건을 찾으려면 내용까지 뒤져야 한다. files/list와 달리 여기는 소속별로
    // 나눠 보는 화면이 아니라 관리자·DB담당자 전원이 같은 큐를 보므로,
    // 내용 검색을 관리자만으로 제한할 이유도 없다.
    //
    // file_content는 파일당 수백 kB라 DB의 ilike로는 못 찾는다(값이 JSON
    // 배열 안에 있다). 전부 받아 메모리에서 걸러낸다 — 이 큐는 배포 전
    // 대기열이라 files/list의 전체 배포본만큼 크지 않다.
    const { data: allFiles, error } = await fetchAllRows<any>(() =>
      supabase
        .from('files')
        .select(
          'id, name, size, uploaded_at, uploaded_by, uploaded_by_name, file_content',
          { count: 'exact' }
        )
        .eq('is_original', true)
        .eq('source', 'file_transfer')
        .order(sortBy, { ascending: sortOrder })
        .order('id', { ascending: true })
    );

    if (error) throw error;

    let files = allFiles ?? [];

    if (search) {
      const searchLower = search.toLowerCase();
      files = files.filter((file) => {
        if (file.name.toLowerCase().includes(searchLower)) return true;
        if ((file.uploaded_by_name || '').toLowerCase().includes(searchLower)) return true;

        if (!Array.isArray(file.file_content)) return false;
        return file.file_content.some((row: any) => {
          if (typeof row !== 'object' || row === null) return false;
          return Object.values(row).some((value) =>
            String(value || '').toLowerCase().includes(searchLower)
          );
        });
      });
    }

    const totalRecords = files.length;
    // file_content는 위 검색에만 쓰는 서버 전용 데이터다. 엑셀 전체가 들어 있어
    // (고객명·연락처·주소) 목록 응답에 실어 보낼 이유가 없다.
    const pagedFiles = files
      .slice(offset, offset + limit)
      .map(({ file_content, ...file }) => file);

    const missingUploaderIds = pagedFiles
      .filter((f) => !f.uploaded_by_name && f.uploaded_by)
      .map((f) => f.uploaded_by);

    if (missingUploaderIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, username')
        .in('id', missingUploaderIds);

      const userMap = new Map(usersData?.map((u) => [u.id, u.name || u.username]) ?? []);
      pagedFiles.forEach((f) => {
        if (!f.uploaded_by_name && f.uploaded_by) {
          f.uploaded_by_name = userMap.get(f.uploaded_by) || null;
        }
      });
    }

    return NextResponse.json({
      data: pagedFiles,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
      },
    });
  } catch (error) {
    console.error('My uploads fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 });
  }
}
