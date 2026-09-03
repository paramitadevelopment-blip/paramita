import type { SupabaseClient } from '@supabase/supabase-js';
import type { Region } from '@/lib/assignmentRegions';
import type { AgeBracket, DepartmentRule } from '@/lib/assignmentRules';

/**
 * 배정 규칙을 DB에서 읽는다.
 *
 * 분류(미리보기)와 배포가 같은 함수를 써야 한다 — 규칙을 읽는 방법이 갈리면
 * 화면에서 본 것과 실제로 나가는 것이 달라진다. findRequiredColumns나
 * loadRecentKeys를 한 곳에 모아둔 것과 같은 이유다.
 */
export interface LoadedRules {
  rules: DepartmentRule[];
  /**
   * 규칙이 마지막으로 바뀐 시각.
   * 분류가 이 값을 내려주고 배포가 대조한다 — 그 사이 설정이 바뀌었으면
   * 미리보기가 거짓말이 되므로 배포를 막아야 한다.
   */
  updatedAt: string | null;
}

export async function loadAssignmentRules(supabase: SupabaseClient): Promise<LoadedRules> {
  const [regionRules, ageRules, meta] = await Promise.all([
    supabase.from('assignment_region_rules').select('department_group, region'),
    supabase.from('assignment_age_rules').select('department_group, age_bracket'),
    supabase.from('assignment_rules_meta').select('updated_at').eq('id', 1).single(),
  ]);

  // 규칙을 못 읽으면 배정을 할 수 없다. 조용히 빈 규칙으로 넘어가면 모든 건이
  // 예외로 빠져, 설정이 사라진 건지 정말 아무도 안 맡은 건지 구분되지 않는다.
  if (regionRules.error) throw regionRules.error;
  if (ageRules.error) throw ageRules.error;

  const byGroup = new Map<string, DepartmentRule>();

  const ensure = (group: string): DepartmentRule => {
    let rule = byGroup.get(group);
    if (!rule) {
      rule = { group, regions: [], ageBrackets: [] };
      byGroup.set(group, rule);
    }
    return rule;
  };

  for (const row of regionRules.data ?? []) {
    ensure(row.department_group).regions.push(row.region as Region);
  }
  for (const row of ageRules.data ?? []) {
    ensure(row.department_group).ageBrackets.push(row.age_bracket as AgeBracket);
  }

  return {
    rules: Array.from(byGroup.values()),
    updatedAt: meta.data?.updated_at ?? null,
  };
}
