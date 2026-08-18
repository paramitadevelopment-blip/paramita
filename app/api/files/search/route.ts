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

    const q = request.nextUrl.searchParams.get('q');
    if (!q || q.trim().length === 0) {
      return NextResponse.json({ error: 'Search query required' }, { status: 400 });
    }

    const query = q.trim().toLowerCase();

    // file_content가 비어있지 않은 파일들을 가져온 후 클라이언트에서 필터링
    const { data: allFiles, error } = await supabase
      .from('files')
      .select('id, name, size, department_id, is_original, uploaded_at, download_count, file_content')
      .order('uploaded_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Search query error:', error);
      return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }

    console.log(`Search: query="${query}", total files=${allFiles?.length || 0}`);

    // file_content 배열의 각 객체에서 검색어를 포함하는 파일만 필터링
    const results = (allFiles || []).filter((file) => {
      if (!file.file_content) {
        console.log(`File ${file.id} has no file_content`);
        return false;
      }

      if (!Array.isArray(file.file_content)) {
        console.log(`File ${file.id} file_content is not array:`, typeof file.file_content);
        return false;
      }

      // 배열의 어느 한 객체에서라도 검색어를 찾으면 매칭
      const matched = file.file_content.some((row: any) => {
        if (typeof row !== 'object' || row === null) return false;

        // 모든 필드의 값을 문자열로 변환해서 검색
        return Object.values(row).some((value) => {
          const strValue = String(value || '').toLowerCase();
          return strValue.includes(query);
        });
      });

      if (matched) {
        console.log(`Match found in file: ${file.name}`);
      }
      return matched;
    });

    console.log(`Search results: ${results.length} files matched`);

    // 응답에서 file_content 제거 (크기 줄이기)
    const response = results.map(({ file_content, ...rest }) => rest);

    return NextResponse.json({ files: response });
  } catch (error) {
    console.error('File search error:', error);
    return NextResponse.json({ error: 'Failed to search files' }, { status: 500 });
  }
}
