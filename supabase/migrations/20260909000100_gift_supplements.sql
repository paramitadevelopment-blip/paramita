-- 사은품 보완 이력.
--
-- 지금은 보완 사유가 신청 행의 한 칸(supplement_reason)에 들어간다. 그래서 같은
-- 건을 두 번 되돌리면 앞의 사유가 덮여 사라진다. 보완은 "고쳐서 다시 올려라"는
-- 뜻이라 오갈 수 있는 일이고, 그 왕복이 몇 번이었는지가 곧 그 건의 사정이다.
--
-- 민원의 complaint_returns와 같은 생각이다. 신청 행의 supplement_* 칸은 '지금
-- 보완 상태인가'만 나타내고(고쳐서 다시 올리면 비워진다), 지나간 보완은 전부
-- 여기 남는다.
CREATE TABLE IF NOT EXISTS public.gift_supplements (
  id BIGSERIAL PRIMARY KEY,
  -- 신청을 지우면 그 이력도 함께 사라진다. 신청 없는 보완 기록은 뜻이 없다.
  gift_request_id bigint NOT NULL REFERENCES public.gift_requests(id) ON DELETE CASCADE,
  reason text NOT NULL,
  -- 계정이 지워져도 "그때 누가 되돌렸다"는 남아야 해서 이름을 함께 적어 둔다.
  returned_by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  returned_by text NOT NULL,
  returned_at timestamptz NOT NULL DEFAULT now()
);

-- 한 건의 보완 이력을 시간 순으로 읽는다.
CREATE INDEX IF NOT EXISTS idx_gift_supplements_request
  ON public.gift_supplements (gift_request_id, returned_at);

-- 앱은 서버에서 service_role 키로 붙는다. service_role은 RLS를 지나치므로
-- 정책 없이 켜 두는 것이 이 프로젝트의 방식이다.
ALTER TABLE public.gift_supplements ENABLE ROW LEVEL SECURITY;
