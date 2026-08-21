-- 요청 사유. 운영 DB에는 이미 추가돼 있으나 마이그레이션에 빠져 있어 여기서 맞춘다.
ALTER TABLE public.redownload_requests
  ADD COLUMN IF NOT EXISTS reason TEXT;

-- 거부 사유. 관리자가 거부할 때 왜 거부했는지 남긴다.
ALTER TABLE public.redownload_requests
  ADD COLUMN IF NOT EXISTS review_reason TEXT;
