-- 민원담당자(complaint)와 설계사(agent) 역할을 추가한다.
--
-- 민원담당자는 담당자 계열이라 소속이 '담당자'로 고정된다 — DB담당자와 같은
-- 자리를 쓴다. 소속 이름을 역할 이름과 다르게 둔 이유가 이것이다
-- (lib/departments.ts의 STAFF_DEPARTMENT 주석 참고).
--
-- 설계사는 지사와 같은 실제 조직에 속한다. users.department에 그 지사의
-- 조직명이 그대로 들어가므로 "○○지사 밑의 설계사"가 별도 표 없이 성립한다.
-- 지사와 설계사를 가르는 것은 소속이 아니라 역할이다.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'user', 'staff', 'subadmin', 'complaint', 'agent'));
