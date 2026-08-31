-- 명단에 오른 경로를 남긴다.
--
-- 지금까지는 상품이 비었는지(수동은 상품을 안 받는다), 신청횟수가 0인지로
-- 눈치껏 갈라야 했다. 규칙이 바뀌면 그 눈치도 같이 틀려지므로 값으로 못박는다.
--
--   system : 배포가 60일 3회 규칙으로 올린 것
--   admin  : 관리자가 화면에서 손으로 올린 것
ALTER TABLE public.blacklist
  ADD COLUMN registered_by TEXT NOT NULL DEFAULT 'system'
    CHECK (registered_by IN ('system', 'admin'));

-- 기존 행 메우기. 출처 파일이 없는 건 사람이 손으로 올린 것뿐이다 —
-- 배포로 오른 행에는 반드시 어느 파일에서 걸렸는지가 남는다.
UPDATE public.blacklist
   SET registered_by = 'admin'
 WHERE source_file_id IS NULL
   AND source_file_name IS NULL;

CREATE INDEX idx_blacklist_registered_by ON public.blacklist(registered_by);
