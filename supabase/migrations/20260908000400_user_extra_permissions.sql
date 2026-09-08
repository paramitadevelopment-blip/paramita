-- 계정별 추가 권한.
--
-- 역할(role)은 "이 사람이 누구인가"이고, 여기는 "그 역할에 더해 무엇을 더
-- 할 수 있나"다. DB담당자 한 명에게 민원 등록과 사은품 관리를 맡기려는데,
-- 역할 자체를 넓히면 앞으로 만드는 DB담당자가 전부 그 권한을 받는다.
-- 그건 원하는 게 아니라서 계정에 붙인다. 사용자 관리 화면에서 체크로 켠다.
--
-- 값은 lib/roles.ts의 EXTRA_PERMISSIONS 중 하나다.
--   complaint_register  민원 등록 화면과 접수
--   gift_manage         사은품 관리 화면과 발주
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS extra_permissions text[] NOT NULL DEFAULT '{}';
