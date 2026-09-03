import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { canClassifyAndDeploy } from '@/lib/roles';
import type { DepartmentRule } from '@/lib/assignmentRules';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 배정 규칙 저장 이력.
 *
 * 규칙을 다루는 사람과 이력을 보는 사람이 같으므로 권한을 저장 쪽에 맞춘다.
 *
 * 조회 방식이 둘이다.
 *   - 기본: 최근 것부터 LIMIT건
 *   - from~to를 주면: 그 기간에 저장된 것만 (오래된 날짜를 짚어 볼 때)
 *
 * 어느 쪽이든 목록 바로 앞의 기록 한 건(previous)을 함께 준다.
 * 화면은 "무엇이 바뀌었나"를 앞 기록과 견줘 계산하는데, 목록의 마지막 줄만
 * 그 짝이 범위 밖에 있어 "처음 저장"으로 잘못 보이기 때문이다.
 */

/** 기본 조회 건수 */
const LIMIT = 30;
/** 기간 조회로 한 번에 읽을 최대 건수. 없으면 넓은 기간을 잡았을 때 통째로 퍼 올린다 */
const MAX_RANGE = 200;

export interface AssignmentRuleLog {
  id: number;
  changedAt: string;
  changedBy: string | null;
  changedByName: string | null;
  rules: DepartmentRule[];
}

const COLUMNS = 'id, changed_at, changed_by, changed_by_name, rules';

function toLog(row: any): AssignmentRuleLog {
  return {
    id: row.id,
    changedAt: row.changed_at,
    changedBy: row.changed_by,
    changedByName: row.changed_by_name,
    rules: (row.rules ?? []) as DepartmentRule[],
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canClassifyAndDeploy(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    /*
     * 날짜 경계는 보는 사람의 시간대에서 정해진다. 서버가 UTC로 자르면
     * 밤에 저장한 기록이 다음 날로 넘어가 있어 그 날짜로는 찾을 수가 없다.
     * 그래서 화면이 그 날의 시작·끝을 시각(ISO)으로 만들어 보낸다.
     */
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');
    const isRange = Boolean(from && to);

    let query = supabase
      .from('assignment_rules_logs')
      .select(COLUMNS)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false });

    if (isRange) {
      query = query.gte('changed_at', from!).lte('changed_at', to!).limit(MAX_RANGE);
    } else {
      query = query.limit(LIMIT);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []).map(toLog);

    /*
     * 목록 바로 앞 기록. 목록이 비어 있으면 견줄 것도 없다.
     * 기간 조회에서는 이 값이 기간 밖에 있으므로 반드시 따로 읽어야 한다.
     */
    let previous: AssignmentRuleLog | null = null;
    const oldest = rows[rows.length - 1];
    if (oldest) {
      const { data: prev, error: prevError } = await supabase
        .from('assignment_rules_logs')
        .select(COLUMNS)
        .lt('changed_at', oldest.changedAt)
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);

      if (prevError) throw prevError;
      previous = prev?.[0] ? toLog(prev[0]) : null;
    }

    return NextResponse.json({
      logs: rows,
      previous,
      // 잘렸는지 알려준다. 화면이 "더 있는데 안 보여준다"를 말할 수 있어야 한다.
      hasMore: rows.length >= (isRange ? MAX_RANGE : LIMIT),
    });
  } catch (error) {
    console.error('Assignment rules log fetch error:', error);
    return NextResponse.json({ error: '저장 이력을 불러오지 못했습니다.' }, { status: 500 });
  }
}
