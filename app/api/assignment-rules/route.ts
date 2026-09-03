import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { canClassifyAndDeploy } from '@/lib/roles';
import { isAssignableDepartmentGroup } from '@/lib/departments';
import { REGIONS, type Region } from '@/lib/assignmentRegions';
import {
  AGE_BRACKETS,
  describeIncomplete,
  findIncompleteRules,
  type AgeBracket,
  type DepartmentRule,
} from '@/lib/assignmentRules';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 배정 규칙 — 어느 소속이 어느 지역·나이대를 받는가.
 *
 * 분류·배포를 하는 사람이 곧 이 설정을 다루는 사람이라 권한을 그쪽에 맞춘다.
 * 소속 자체를 만들고 지우는 것(admin 전용)과는 다른 일이다.
 */

/** 배정 규칙을 붙일 수 있는 조직 목록. 화면의 열이자 저장 시 검증 기준이다. */
async function loadAssignableGroups(): Promise<string[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('group_name, is_admin')
    .order('id', { ascending: true });

  if (error) throw error;

  const groups: string[] = [];
  for (const dept of data ?? []) {
    if (!isAssignableDepartmentGroup(dept.group_name, dept.is_admin)) continue;
    if (!groups.includes(dept.group_name)) groups.push(dept.group_name);
  }
  return groups;
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

    const [groups, regionRules, ageRules, meta] = await Promise.all([
      loadAssignableGroups(),
      supabase.from('assignment_region_rules').select('department_group, region'),
      supabase.from('assignment_age_rules').select('department_group, age_bracket'),
      supabase.from('assignment_rules_meta').select('updated_at, updated_by').eq('id', 1).single(),
    ]);

    if (regionRules.error) throw regionRules.error;
    if (ageRules.error) throw ageRules.error;

    // 화면이 쓰기 좋은 모양으로 접어서 준다 — 소속마다 지역 배열·나이 배열.
    // 설정이 없는 소속도 빈 배열로 넣는다. 빠뜨리면 화면이 "없는 소속"으로 본다.
    const rules: DepartmentRule[] = groups.map((group) => ({
      group,
      regions: (regionRules.data ?? [])
        .filter((r) => r.department_group === group)
        .map((r) => r.region as Region),
      ageBrackets: (ageRules.data ?? [])
        .filter((r) => r.department_group === group)
        .map((r) => r.age_bracket as AgeBracket),
    }));

    return NextResponse.json({
      groups,
      rules,
      updatedAt: meta.data?.updated_at ?? null,
      updatedBy: meta.data?.updated_by ?? null,
    });
  } catch (error) {
    console.error('Assignment rules fetch error:', error);
    return NextResponse.json({ error: '배정 규칙을 불러오지 못했습니다.' }, { status: 500 });
  }
}

/**
 * 규칙 전체를 새로 쓴다.
 *
 * 화면이 표 전체를 들고 있으므로 부분 수정이 아니라 통째로 교체한다 —
 * 체크 하나마다 추가·삭제를 보내면 중간에 실패했을 때 화면과 DB가 갈린다.
 */
export async function PUT(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!canClassifyAndDeploy(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const incoming = Array.isArray(body?.rules) ? body.rules : null;

    if (!incoming) {
      return NextResponse.json({ error: 'rules가 없습니다.' }, { status: 400 });
    }

    const groups = await loadAssignableGroups();

    /*
     * 값 검증.
     *
     * 배포는 소속 이름이 departments.name과 글자 그대로 맞을 때만 파일을 만든다.
     * 없는 이름이 규칙에 들어가면 그 소속으로 배정된 건이 에러도 없이 사라지므로,
     * 저장하는 자리에서 막는다. 지역·나이도 목록에 있는 값만 받는다.
     */
    const regionRows: Array<{ department_group: string; region: string }> = [];
    const ageRows: Array<{ department_group: string; age_bracket: string }> = [];

    for (const rule of incoming) {
      const group = String(rule?.group ?? '');
      if (!groups.includes(group)) {
        return NextResponse.json(
          { error: `배정할 수 없는 소속입니다: ${group}` },
          { status: 400 }
        );
      }

      for (const region of rule?.regions ?? []) {
        if (!(REGIONS as readonly string[]).includes(region)) {
          return NextResponse.json({ error: `알 수 없는 지역입니다: ${region}` }, { status: 400 });
        }
        regionRows.push({ department_group: group, region });
      }

      for (const bracket of rule?.ageBrackets ?? []) {
        if (!(AGE_BRACKETS as readonly string[]).includes(bracket)) {
          return NextResponse.json(
            { error: `알 수 없는 나이 구간입니다: ${bracket}` },
            { status: 400 }
          );
        }
        ageRows.push({ department_group: group, age_bracket: bracket });
      }
    }

    /*
     * 설정이 덜 된 소속이 있으면 통째로 막는다.
     *
     * 지역과 나이는 AND로 걸려서 한쪽이 비면 그 소속은 아무 건도 못 받는다.
     * 화면상으로는 체크가 몇 개 있어 설정된 것처럼 보이는데 배정에서는 조용히
     * 빠지므로, 그 지역 건이 전부 수동배정으로 떨어지고 나서야 알게 된다.
     *
     * 화면에서도 같은 검사를 하지만 여기서 다시 본다 — 화면에서만 막으면
     * API로는 그대로 들어온다.
     */
    const incomplete = findIncompleteRules(
      incoming.map((rule: DepartmentRule) => ({
        group: String(rule?.group ?? ''),
        regions: rule?.regions ?? [],
        ageBrackets: rule?.ageBrackets ?? [],
      }))
    );

    if (incomplete.length > 0) {
      return NextResponse.json(
        {
          error:
            '설정이 안된 소속이 있습니다. 모든 소속에 지역과 나이를 하나 이상 골라주세요.\n' +
            incomplete.map((item) => `· ${item.group} — ${describeIncomplete(item)}`).join('\n'),
          incomplete,
        },
        { status: 400 }
      );
    }

    /*
     * 지우고 넣는다.
     *
     * PostgREST에는 트랜잭션이 없어서 지운 뒤 넣기 전에 실패하면 규칙이 빈 채로
     * 남는다. 그래도 조용히 틀리게 배정되는 것보다 낫다 — 규칙이 비면 모든 건이
     * 예외로 빠져 사람이 고르게 되므로, 잘못된 배정이 아니라 눈에 띄는 멈춤이 된다.
     */
    const delRegions = await supabase
      .from('assignment_region_rules')
      .delete()
      .not('id', 'is', null);
    if (delRegions.error) throw delRegions.error;

    const delAges = await supabase.from('assignment_age_rules').delete().not('id', 'is', null);
    if (delAges.error) throw delAges.error;

    if (regionRows.length > 0) {
      const { error } = await supabase.from('assignment_region_rules').insert(regionRows);
      if (error) throw error;
    }

    if (ageRows.length > 0) {
      const { error } = await supabase.from('assignment_age_rules').insert(ageRows);
      if (error) throw error;
    }

    // 분류와 배포가 같은 규칙을 봤는지 대조하는 값. 규칙을 바꿨으면 반드시 함께 바뀌어야 한다.
    const updatedAt = new Date().toISOString();
    const { error: metaError } = await supabase
      .from('assignment_rules_meta')
      .update({ updated_at: updatedAt, updated_by: user.username })
      .eq('id', 1);
    if (metaError) throw metaError;

    /*
     * 저장 이력. 그때의 규칙 전체를 통째로 남긴다.
     *
     * 실패해도 저장 자체는 되돌리지 않는다 — 규칙은 이미 바뀌었고, 여기서
     * 에러를 내면 사람은 "저장이 안 됐다"고 읽고 다시 누른다. 이력이 한 줄
     * 빠지는 것보다 같은 설정을 두 번 저장하는 쪽이 헷갈린다.
     */
    const { error: logError } = await supabase.from('assignment_rules_logs').insert({
      changed_at: updatedAt,
      changed_by: user.username,
      changed_by_name: user.name ?? null,
      rules: incoming.map((rule: DepartmentRule) => ({
        group: String(rule?.group ?? ''),
        regions: rule?.regions ?? [],
        ageBrackets: rule?.ageBrackets ?? [],
      })),
    });
    if (logError) console.error('Assignment rules log insert failed:', logError);

    return NextResponse.json({ success: true, updatedAt });
  } catch (error) {
    console.error('Assignment rules save error:', error);
    return NextResponse.json({ error: '배정 규칙을 저장하지 못했습니다.' }, { status: 500 });
  }
}
