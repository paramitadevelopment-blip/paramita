import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { hasHistoryAccess } from '@/lib/historyAccess';
import { parsePagination } from '@/lib/pagination';
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
    if (user.role !== 'admin' && user.role !== 'subadmin') {
      return NextResponse.json({ error: 'Only admin can view file history' }, { status: 403 });
    }

    // 화면에서 비밀번호를 막아도 API를 직접 부르면 뚫리므로 여기서 다시 확인한다.
    if (!hasHistoryAccess(request, user.id)) {
      return NextResponse.json({ error: '비밀번호 확인이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    // page=abc면 NaN이 되어 range(NaN, NaN)으로 나가고, limit이 커지면 한 번에 다 퍼간다.
    const { page, limit, offset } = parsePagination(
      searchParams.get('page'),
      searchParams.get('limit')
    );
    const search = searchParams.get('search') || '';
    // 통합 검색 화면은 일괄 삭제 묶음 전체가 아니라 검색어와 맞는 파일만 필요하다.
    const matchedOnly = searchParams.get('matchedOnly') === 'true';

    // 검색어가 있으면 deleted_files에서 일치하는 이벤트를 찾는다
    let eventIdsToShow: number[] | null = null;
    let matchedFileIds: Set<string> | null = null;
    if (search.trim()) {
      const searchLower = search.toLowerCase();

      // 이벤트에는 아이디만 남아 있어 실명으로는 못 찾는다. 이름이 걸리는
      // 계정을 먼저 찾아 그 아이디로 이벤트를 집는다 — 화면에 아이디(이름)으로
      // 보이는데 이름으로 검색이 안 되면 보이는 대로 찾을 수가 없다.
      const { data: matchedUsers } = await supabase
        .from('users')
        .select('username')
        .ilike('name', `%${search}%`);
      const matchedUsernames = (matchedUsers || []).map((u) => u.username);

      // 파일명·내용뿐 아니라 "누가 지웠는지"로도 찾을 수 있어야 한다.
      // deleted_by는 파일이 아니라 이벤트 쪽 컬럼이라 따로 조회한다.
      const [{ data: allDeletedFiles }, { data: eventsByLoginId }, { data: eventsByName }] =
        await Promise.all([
          supabase.from('deleted_files').select('id, deletion_event_id, name, file_content'),
          supabase.from('file_deletion_events').select('id').ilike('deleted_by', `%${search}%`),
          matchedUsernames.length > 0
            ? supabase.from('file_deletion_events').select('id').in('deleted_by', matchedUsernames)
            : Promise.resolve({ data: [] as Array<{ id: number }> }),
        ]);

      const matchedEventIds = new Set<number>([
        ...(eventsByLoginId || []).map((e) => e.id),
        ...(eventsByName || []).map((e) => e.id),
      ]);
      const fileIds = new Set<string>();

      (allDeletedFiles || []).forEach((file) => {
        // 삭제한 사람으로 이미 걸린 이벤트면, 그 안의 파일은 이름·내용과
        // 무관하게 전부 matchedOnly(검색 화면)에 나와야 한다.
        if (matchedEventIds.has(file.deletion_event_id)) {
          fileIds.add(String(file.id));
          return;
        }

        // 파일명 검색
        let found = String(file.name || '').toLowerCase().includes(searchLower);

        // 엑셀 내용(file_content) 검색
        if (!found && Array.isArray(file.file_content)) {
          found = file.file_content.some((row: any) => {
            if (typeof row !== 'object' || row === null) return false;
            return Object.values(row).some((value) =>
              String(value || '').toLowerCase().includes(searchLower)
            );
          });
        }

        if (found) {
          matchedEventIds.add(file.deletion_event_id);
          fileIds.add(String(file.id));
        }
      });

      eventIdsToShow = Array.from(matchedEventIds);
      matchedFileIds = fileIds;
    }

    // 이벤트 목록 조회
    let eventQuery = supabase
      .from('file_deletion_events')
      .select('*', { count: 'exact', head: true });

    if (eventIdsToShow !== null) {
      if (eventIdsToShow.length === 0) {
        // 검색 결과가 없음
        return NextResponse.json({
          events: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        });
      }
      eventQuery = eventQuery.in('id', eventIdsToShow);
    }

    const { count } = await eventQuery;

    // 삭제 이벤트 조회 (최신순)
    let eventsQuery = supabase
      .from('file_deletion_events')
      .select('id, deleted_at, deleted_by, total_count, reason, restored_at, restored_by')
      // 일괄 삭제하면 여러 행의 deleted_at이 같다. 동점 순서를 못 박아야
      // 페이지를 넘길 때 같은 행이 두 번 나오거나 빠지지 않는다.
      .order('deleted_at', { ascending: false })
      .order('id', { ascending: false });

    if (eventIdsToShow !== null && eventIdsToShow.length > 0) {
      eventsQuery = eventsQuery.in('id', eventIdsToShow);
    }

    const { data: events, error: eventsError } = await eventsQuery.range(offset, offset + limit - 1);

    if (eventsError) {
      throw eventsError;
    }

    // 각 이벤트별 삭제된 파일 조회
    const eventIds = (events || []).map((e) => e.id);
    let filesByEvent: Record<number, any[]> = {};

    if (eventIds.length > 0) {
      const { data: files, error: filesError } = await supabase
        .from('deleted_files')
        .select(
          'id, name, size, department_id, is_original, original_file_id, restored_at, deletion_event_id, source'
        )
        .in('deletion_event_id', eventIds)
        .order('deletion_event_id', { ascending: false })
        .order('id', { ascending: false });

      if (filesError) {
        throw filesError;
      }

      filesByEvent = {};
      (files || []).forEach((file) => {
        // matchedOnly면 검색어와 맞는 파일만 남긴다.
        if (matchedOnly && matchedFileIds && !matchedFileIds.has(String(file.id))) {
          return;
        }
        if (!filesByEvent[file.deletion_event_id]) {
          filesByEvent[file.deletion_event_id] = [];
        }
        filesByEvent[file.deletion_event_id].push(file);
      });
    }

    /*
     * 삭제한 사람의 실명.
     *
     * 이벤트에는 아이디(deleted_by)만 남아 있어 화면에서 누구인지 바로 안 보인다.
     * 삭제 시점에 이름을 같이 저장하는 방법도 있지만, 그러면 그 전에 쌓인 이력은
     * 끝내 아이디만 남는다. 조회할 때 users에서 찾아 붙이면 예전 기록에도 이름이
     * 보인다. 계정이 지워졌으면 찾을 게 없으므로 이름 없이 아이디만 내보낸다.
     */
    const deleterUsernames = Array.from(
      new Set((events || []).map((e) => e.deleted_by).filter(Boolean))
    );
    const nameByUsername = new Map<string, string>();

    if (deleterUsernames.length > 0) {
      const { data: deleters } = await supabase
        .from('users')
        .select('username, name')
        .in('username', deleterUsernames);

      (deleters || []).forEach((u) => {
        if (u.name) nameByUsername.set(u.username, u.name);
      });
    }

    // 이벤트와 파일을 함께 반환
    const eventsWithFiles = (events || []).map((event) => ({
      ...event,
      deleted_by_name: nameByUsername.get(event.deleted_by) || null,
      files: filesByEvent[event.id] || [],
    }));

    const totalPages = Math.ceil((count || 0) / limit);

    return NextResponse.json({
      events: eventsWithFiles,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
      },
    });
  } catch (error) {
    console.error('File history fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch file history' }, { status: 500 });
  }
}
