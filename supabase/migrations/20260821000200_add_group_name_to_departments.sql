-- 소속(departments)은 지금 두 가지를 겸하고 있다.
--   1) 파일 배정 분류 — 배정 규칙이 만들어내는 값 (파라인슈1, 파라인슈2)
--   2) 사용자 소속 — 실제 조직 (파라인슈)
-- 대부분은 둘이 1:1이라 문제가 없었지만 파라인슈만 1:N이라 어긋난다.
-- group_name으로 "이 분류가 어느 조직에 속하는지"를 표시해 둘을 분리한다.
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS group_name TEXT;

-- 1:1인 소속은 자기 자신이 그룹이다. 이렇게 두면 조회 코드가 소속별로 갈리지 않는다.
UPDATE public.departments
SET group_name = CASE
  WHEN name IN ('파라인슈1', '파라인슈2') THEN '파라인슈'
  ELSE name
END
WHERE group_name IS NULL;

ALTER TABLE public.departments
  ALTER COLUMN group_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_departments_group_name
  ON public.departments(group_name);

-- 사용자 소속은 조직 단위로 저장한다. 지금 파라인슈1/2 소속 사용자는 없지만,
-- 남아 있으면 그룹 조회에 걸리지 않아 파일이 하나도 안 보이게 된다.
UPDATE public.users
SET department = '파라인슈'
WHERE department IN ('파라인슈1', '파라인슈2');
