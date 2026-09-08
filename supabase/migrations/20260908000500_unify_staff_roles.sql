-- 담당자 역할을 하나로 합친다.
--
-- 전에는 DB담당자·민원담당자·사은품담당자가 각각 역할이었다. 그런데 셋은
-- 소속도 '담당자'로 같고, 하는 일만 다르다. 한 사람이 둘을 겸하는 일이
-- 생기자 역할로는 표현할 수 없어 계정별 추가 권한을 붙였는데, 그러고 나니
-- 역할이 셋일 이유가 없어졌다.
--
-- 이제 역할은 '담당자'(staff) 하나이고, 무엇을 하는지는 추가 권한이 정한다.
--   file_transfer       파일전달
--   complaint_register  민원 등록
--   gift_manage         사은품 관리
--
-- 지금 계정들이 하던 일은 그대로 유지된다 — 역할을 옮기면서 그 역할이
-- 주던 권한을 추가 권한으로 옮겨 적는다.

-- 1) DB담당자: 파일전달을 하고 있었다.
UPDATE public.users
SET extra_permissions = (
  SELECT ARRAY(SELECT DISTINCT unnest(extra_permissions || ARRAY['file_transfer']))
)
WHERE role = 'staff';

-- 2) 민원담당자 → 담당자 + 민원 등록
UPDATE public.users
SET role = 'staff',
    extra_permissions = (
      SELECT ARRAY(SELECT DISTINCT unnest(extra_permissions || ARRAY['complaint_register']))
    )
WHERE role = 'complaint';

-- 3) 사은품담당자 → 담당자 + 사은품 관리
UPDATE public.users
SET role = 'staff',
    extra_permissions = (
      SELECT ARRAY(SELECT DISTINCT unnest(extra_permissions || ARRAY['gift_manage']))
    )
WHERE role = 'gift';

-- 4) 담당자는 소속이 '담당자'로 고정이다. 옮겨 온 계정도 맞춰 둔다.
UPDATE public.users SET department = '담당자' WHERE role = 'staff' AND department IS DISTINCT FROM '담당자';
