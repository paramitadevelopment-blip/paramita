-- 관리자가 지운 사은품 신청의 보관본.
--
-- 관리자(admin·subadmin)는 상태와 무관하게 신청을 지울 수 있다. 잘못 들어간
-- 개인정보나 시험 삼아 넣은 건은 닫아 두는 것으로 안 되고 없애야 한다.
--
-- 다만 그냥 지우면 그 건이 있었다는 사실조차 남지 않는다 — 어느 발주리스트에
-- 실렸었는지, 송장이 뭐였는지, 왜 되돌렸었는지까지. 한 줄을 통째로 담아 둔다.
-- 민원(deleted_complaints)·파일(deleted_files)과 같은 방식이다. 되돌리는 기능은
-- 없다. "무엇을 누가 왜 지웠나"에 답할 수 있으면 된다.
CREATE TABLE IF NOT EXISTS public.deleted_gift_requests (
  id BIGSERIAL PRIMARY KEY,
  -- 지워진 신청의 원래 번호. 외래키를 걸지 않는다 — 가리킬 행이 없다.
  gift_request_id bigint NOT NULL,
  -- 신청 한 줄 통째로. 열이 늘어도 이 표는 안 고쳐도 된다.
  snapshot jsonb NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) <= 500),
  deleted_by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_by text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deleted_gift_requests_at ON public.deleted_gift_requests (deleted_at DESC);
ALTER TABLE public.deleted_gift_requests ENABLE ROW LEVEL SECURITY;
