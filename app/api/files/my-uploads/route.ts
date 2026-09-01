import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { parsePagination } from '@/lib/pagination';

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

    if (user.role !== 'admin' && user.role !== 'subadmin' && user.role !== 'staff') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );

    // 파일전달로 들어온 원본만 본다. 관리자가 파일업로드에서 직접 올린 원본은
    // 원본파일 관리 쪽 것이라 여기 섞이면 안 된다 — 두 화면이 같은 행을 보고
    // 있었기 때문에, 한쪽에 올리면 다른 쪽에도 뜨고 한쪽에서 지우면 양쪽에서
    // 사라졌다.
    const { data: filesData, error, count } = await supabase
      .from('files')
      .select('id, name, size, uploaded_at, uploaded_by, uploaded_by_name', { count: 'exact' })
      .eq('is_original', true)
      .eq('source', 'file_transfer')
      .order('uploaded_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const files = filesData ?? [];
    const missingUploaderIds = files
      .filter((f) => !f.uploaded_by_name && f.uploaded_by)
      .map((f) => f.uploaded_by);

    if (missingUploaderIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, username')
        .in('id', missingUploaderIds);

      const userMap = new Map(usersData?.map((u) => [u.id, u.name || u.username]) ?? []);
      files.forEach((f) => {
        if (!f.uploaded_by_name && f.uploaded_by) {
          f.uploaded_by_name = userMap.get(f.uploaded_by) || null;
        }
      });
    }

    return NextResponse.json({
      data: files,
      pagination: {
        page,
        limit,
        totalRecords: count ?? 0,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
      },
    });
  } catch (error) {
    console.error('My uploads fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 });
  }
}
