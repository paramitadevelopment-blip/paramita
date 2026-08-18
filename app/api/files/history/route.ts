import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { hasHistoryAccess } from '@/lib/historyAccess';
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

    // Admin만 히스토리 조회 가능
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can view file history' }, { status: 403 });
    }

    // 화면에서 비밀번호를 막아도 API를 직접 부르면 뚫리므로 여기서 다시 확인한다.
    if (!hasHistoryAccess(request, user.id)) {
      return NextResponse.json({ error: '비밀번호 확인이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    // 통합 검색 화면은 일괄 삭제 묶음 전체가 아니라 검색어와 맞는 파일만 필요하다.
    const matchedOnly = searchParams.get('matchedOnly') === 'true';

    const offset = (page - 1) * limit;

    // 검색어가 있으면 deleted_files에서 일치하는 이벤트를 찾는다
    let eventIdsToShow: number[] | null = null;
    let matchedFileIds: Set<string> | null = null;
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      const { data: allDeletedFiles } = await supabase
        .from('deleted_files')
        .select('id, deletion_event_id, name, file_content');

      if (allDeletedFiles && allDeletedFiles.length > 0) {
        const matchedEventIds = new Set<number>();
        const fileIds = new Set<string>();

        allDeletedFiles.forEach((file) => {
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
      .order('deleted_at', { ascending: false });

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
          'id, name, size, department_id, is_original, original_file_id, restored_at, deletion_event_id'
        )
        .in('deletion_event_id', eventIds)
        .order('deletion_event_id', { ascending: false });

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

    // 이벤트와 파일을 함께 반환
    const eventsWithFiles = (events || []).map((event) => ({
      ...event,
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
