-- 재다운로드 요청은 "누가 한도를 넘겨 받아가겠다고 했고, 관리자가 왜 허락했는가"의 기록이다.
-- 사용자를 지우면 이 이력이 함께 사라졌다(ON DELETE CASCADE).
-- 사용자를 지우는 시점은 퇴사·계정정리, 혹은 문제가 생겼을 때다.
-- 조사해야 할 상황에서 조사 자료가 먼저 없어지는 셈이라 순서가 거꾸로다.
--
-- download_records가 이미 쓰는 방식과 같게 맞춘다:
-- 요청 시점의 사람 정보를 복사해 두고, 사용자와의 연결만 끊는다.

ALTER TABLE public.redownload_requests
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS user_name TEXT,
  ADD COLUMN IF NOT EXISTS user_employee_id TEXT,
  ADD COLUMN IF NOT EXISTS user_department TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by_name TEXT;

UPDATE public.redownload_requests r
SET username = u.username,
    user_name = u.name,
    user_employee_id = u.employee_id,
    user_department = u.department
FROM public.users u
WHERE r.user_id = u.id AND r.username IS NULL;

UPDATE public.redownload_requests r
SET reviewed_by_name = u.name
FROM public.users u
WHERE r.reviewed_by = u.id AND r.reviewed_by_name IS NULL;

ALTER TABLE public.redownload_requests
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.redownload_requests
  DROP CONSTRAINT redownload_requests_user_id_fkey;

ALTER TABLE public.redownload_requests
  ADD CONSTRAINT redownload_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_redownload_requests_user_department
  ON public.redownload_requests(user_department);
