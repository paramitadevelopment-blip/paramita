-- 원본 파일이 들어가는 소속을 무엇으로 찾을지 정한다.
--
-- id를 숫자로 박으면 DB를 다시 만들 때 어긋나고, 이름('관리자')으로 찾으면
-- 소속명을 바꾸는 순간 업로드가 전부 실패한다. 둘 다 바뀔 수 있는 값이라
-- 역할을 나타내는 표시를 따로 둔다.
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

UPDATE public.departments SET is_admin = true WHERE name = '관리자';

-- 이 자리는 하나뿐이어야 한다. 둘이면 업로드가 어느 쪽으로 갈지 정해지지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_single_admin
  ON public.departments(is_admin) WHERE is_admin;
