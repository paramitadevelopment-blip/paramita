-- 서브관리자(subadmin) 역할 추가.
--
-- 서브관리자는 사용자 관리를 제외한 모든 관리자 기능(파일 업로드·분류·배포,
-- 원본파일 관리, 다운로드 승인, 재신청, 블랙리스트, 다운로드 로그 등)을
-- 관리자와 동일하게 수행할 수 있는 역할이다.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'user', 'staff', 'subadmin'));
