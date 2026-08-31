-- 사유는 길이 제한 없이 들어오면 그대로 저장된다. file_deletion_events.reason과 같은
-- 기준(1~500자)으로 DB에서도 막는다. API에서도 같은 값으로 검증한다.
ALTER TABLE public.redownload_requests
  ADD CONSTRAINT redownload_requests_reason_length
  CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 1 AND 500);

ALTER TABLE public.redownload_requests
  ADD CONSTRAINT redownload_requests_review_reason_length
  CHECK (review_reason IS NULL OR char_length(btrim(review_reason)) BETWEEN 1 AND 500);
