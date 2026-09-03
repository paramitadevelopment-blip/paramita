-- 파라인슈1·파라인슈2를 '파라인슈' 하나로 합친다.
--
-- 이 둘은 70세를 기준으로 갈리던 배정 분류였다. 지역·나이를 화면에서 설정하게
-- 되면서 나이로 나눌 일은 배정 규칙(assignment_age_rules)이 맡게 됐고, 그러려고
-- 소속 행을 둘로 쪼개 둘 이유가 없어졌다.
--
-- 코드는 손대지 않는다. resolveDeptName()이 "조직 안의 분류가 하나면 그대로 쓴다"로
-- 이미 돼 있어(lib/insurance.ts), 행을 합치기만 하면 그대로 동작한다.
-- 코드에 남은 '파라인슈1' 언급은 전부 주석이고 판정에 관여하지 않는다.
--
-- ── 되돌리려면 ────────────────────────────────────────────────
-- 다시 나눠야 하면 아래 두 줄을 실행한다.
--
--   INSERT INTO public.departments (name, group_name, is_admin)
--        VALUES ('파라인슈2', '파라인슈', false);
--   UPDATE public.departments SET name = '파라인슈1' WHERE name = '파라인슈';
--
-- 되돌린 직후부터 resolveDeptName()이 이름 순으로 앞뒤를 갈라
-- 70세 미만 → 파라인슈1, 70세 이상 → 파라인슈2로 예전과 같이 동작한다.
--
-- 다만 되돌아오지 않는 것이 있다: 이미 배포된 파일이 1이었는지 2였는지는
-- 이 마이그레이션에서 '파라인슈1' 쪽으로 합쳐지며 사라진다. 되돌려도 과거 파일은
-- 전부 파라인슈1에 남고, 새로 들어오는 건부터 다시 갈린다.
-- ──────────────────────────────────────────────────────────────

-- 1) 파라인슈2로 배포된 파일을 파라인슈1 쪽으로 옮긴다.
--    옮기지 않고 소속을 지우면 files.department_id는 NULL이 되고,
--    file_distributions는 FK가 ON DELETE CASCADE라 행이 통째로 사라진다.
UPDATE public.files
   SET department_id = (SELECT id FROM public.departments WHERE name = '파라인슈1')
 WHERE department_id = (SELECT id FROM public.departments WHERE name = '파라인슈2');

-- file_distributions는 UNIQUE(file_id, department_id)라, 한 파일이 1·2 양쪽에
-- 걸려 있으면 그대로 옮길 수 없다. 겹치는 쪽을 먼저 지우고 나머지를 옮긴다.
DELETE FROM public.file_distributions two
 WHERE two.department_id = (SELECT id FROM public.departments WHERE name = '파라인슈2')
   AND EXISTS (
     SELECT 1
       FROM public.file_distributions one
      WHERE one.file_id = two.file_id
        AND one.department_id = (SELECT id FROM public.departments WHERE name = '파라인슈1')
   );

UPDATE public.file_distributions
   SET department_id = (SELECT id FROM public.departments WHERE name = '파라인슈1')
 WHERE department_id = (SELECT id FROM public.departments WHERE name = '파라인슈2');

-- 2) 사용자 소속은 조직명('파라인슈')으로 저장되므로 원래 손댈 것이 없다.
--    그래도 분류명이 잘못 들어간 계정이 있으면 소속 없는 사람이 되므로 맞춰 둔다.
UPDATE public.users
   SET department = '파라인슈'
 WHERE department IN ('파라인슈1', '파라인슈2');

-- 3) 소속 행을 합친다.
--    UNIQUE(name)이라 '파라인슈'가 비어 있어야 이름을 바꿀 수 있다 —
--    지금은 파라인슈1·파라인슈2뿐이라 비어 있다.
DELETE FROM public.departments WHERE name = '파라인슈2';

UPDATE public.departments
   SET name = '파라인슈'
 WHERE name = '파라인슈1';

-- 4) 배정 규칙은 조직명('파라인슈')으로 저장돼 있어 그대로 살아 있다.
--    reapply_notices.assigned_dept 같은 기록에 남은 '파라인슈1'은 손대지 않는다.
--    그때 실제로 그 분류로 나갔다는 사실이라, 고치면 이력이 거짓이 된다.
