-- DB담당자(staff) 역할 추가.
--
-- users.role은 지금까지 제약이 없는 문자열이었다. 값이 하나 느는 김에
-- 잠가 둔다 — blacklist.registered_by와 같은 패턴이다.
--
-- DB담당자는 파일 업로드·분류·배포만 쓸 수 있는 역할이다. 소속(department)과는
-- 무관하다 — 관리자 계정도 소속이 '관리자'라는 특수 소속일 뿐 소속 자체가
-- 권한을 정하지 않는 것과 같은 원칙이다.
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'user', 'staff'));
