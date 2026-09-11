import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { isAdminRole } from '@/lib/roles';
import { ASSIGNED_BY_COLUMN } from '@/lib/insurance';
import {
  countByDepartment,
  dailyAverage,
  countByInsurer,
  daysBetween,
  isDayString,
  koreanDayBounds,
  mergeRangeRows,
  type RangeSourceFile,
} from '@/lib/rangeRows';
import { AGE_SPLIT_DEPARTMENTS, countAgeSplit } from '@/lib/rangeAges';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 기간 조회 — 두 날짜 사이에 배포된 파일의 행을 한 표로.
 *
 * 파일다운로드 화면은 파일 단위라 "이달 우리 지사에 온 건"을 한눈에 볼 수
 * 없었다. 여기서는 배포일이 기간에 드는 파일들의 저장된 행(file_content)을
 * 합쳐 준다. **눈으로 보는 용도**다 — 엑셀로 내주지 않고, 다운로드 횟수도
 * 세지 않는다. 그래서 파일을 내려받은 기록에도 남지 않는다.
 *
 * 범위는 파일 목록과 같다. 지사는 자기 조직이 받은 배포본만, 관리자는 전부.
 * 배정방식 열은 관리자에게만 낸다(다운로드 파일과 같은 규칙).
 */

/** 한 번에 내주는 행 상한. 넘으면 앞에서 자르고 잘렸다고 알린다. */
const MAX_ROWS = 5000;

/** 볼 것이 하나도 없을 때의 응답. 모양은 있을 때와 같아야 화면이 분기하지 않는다. */
const nothing = (days: number) => ({
  headers: [],
  rows: [],
  total: 0,
  truncated: false,
  days,
  dailyAverage: 0,
  byDepartment: [],
  byInsurer: { dy: 0, hk: 0, etc: 0 },
  files: [],
});

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from = (searchParams.get('from') || '').trim();
    const to = (searchParams.get('to') || '').trim();

    if (!isDayString(from) || !isDayString(to)) {
      return NextResponse.json({ error: '시작일과 종료일을 YYYY-MM-DD로 주세요.' }, { status: 400 });
    }
    const days = daysBetween(from, to);
    if (days <= 0) {
      return NextResponse.json({ error: '종료일이 시작일보다 앞입니다.' }, { status: 400 });
    }

    const isAdmin = isAdminRole(user.role);

    /*
     * 지사는 자기 조직이 받은 배포본만. 소속을 못 읽으면 아무것도 안 준다 —
     * 필터가 안 걸린 채 넘어가면 전 지사 고객이 나간다. 목록 API와 같은 규칙이다.
     */
    let departmentIds: number[] | null = null;
    if (!isAdmin) {
      const { data: me } = await supabase.from('users').select('department').eq('id', user.id).single();
      if (!me?.department) return NextResponse.json(nothing(days));
      const { data: depts } = await supabase
        .from('departments')
        .select('id')
        .eq('group_name', me.department);
      departmentIds = (depts ?? []).map((d) => d.id);
      if (departmentIds.length === 0) return NextResponse.json(nothing(days));
    }

    const { start, end } = koreanDayBounds(from, to);
    let query = supabase
      .from('files')
      .select('id, name, uploaded_at, file_content, insurer_type, departments(name)')
      .eq('is_original', false)
      .gte('uploaded_at', start)
      .lte('uploaded_at', end)
      .order('uploaded_at', { ascending: true });
    if (departmentIds) query = query.in('department_id', departmentIds);

    const { data, error } = await query;
    if (error) {
      console.error('Range query error:', error);
      return NextResponse.json({ error: '기간 조회에 실패했습니다.' }, { status: 500 });
    }

    const sources: RangeSourceFile[] = (data ?? []).map((file: any) => ({
      name: file.name,
      uploadedAt: file.uploaded_at,
      department: file.departments?.name ?? null,
      insurer: file.insurer_type === 'hk' || file.insurer_type === 'dy' ? file.insurer_type : null,
      rows: Array.isArray(file.file_content) ? file.file_content : [],
    }));

    // 배정방식은 관리자만 본다. 지사는 자기 건을 처리하면 될 뿐이다.
    const merged = mergeRangeRows(sources, isAdmin ? [] : [ASSIGNED_BY_COLUMN]);
    const truncated = merged.rows.length > MAX_ROWS;

    return NextResponse.json({
      headers: merged.headers,
      rows: truncated ? merged.rows.slice(0, MAX_ROWS) : merged.rows,
      total: merged.rows.length,
      truncated,
      // 기간의 달력 날짜 수. 일평균의 분모다.
      days,
      dailyAverage: dailyAverage(merged.rows.length, days),
      // 소속별 건수. 지사는 자기 것 하나만 온다 — 위에서 이미 자기 소속으로 좁혔다.
      // 파라인슈는 나이 구간(70세 미만/이상)도 붙인다. 배정이 나이로 갈리는 소속이다.
      byDepartment: countByDepartment(sources, days).map((d) =>
        AGE_SPLIT_DEPARTMENTS.includes(d.department)
          ? { ...d, byAge: countAgeSplit(sources.filter((s) => (s.department ?? '소속 없음') === d.department)) }
          : d
      ),
      // 기간 전체의 보험사별 건수. 소속 단추의 '전체' 자리에 붙는다.
      byInsurer: countByInsurer(sources),
      files: sources.map((s) => ({ name: s.name, uploadedAt: s.uploadedAt, department: s.department, count: s.rows.length })),
    });
  } catch (error) {
    console.error('Range query error:', error);
    return NextResponse.json({ error: '기간 조회에 실패했습니다.' }, { status: 500 });
  }
}
