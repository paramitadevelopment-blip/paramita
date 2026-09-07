-- 반려 이력.
--
-- 지금은 반려 사유가 민원 행의 한 칸(return_reason)에 들어간다. 그래서 같은
-- 건을 두 번 반려하면 앞의 사유가 덮여 사라진다. 반려는 "고쳐서 다시 보내라"는
-- 뜻이라 오갈 수 있는 일이고, 그 왕복이 몇 번이었는지가 곧 그 건의 사정이다.
--
-- 그래서 반려는 지울 수 없는 기록으로 따로 쌓는다. 민원 행의 return_* 칸은
-- '지금 반려 상태인가'만 나타내고(고쳐서 다시 보내면 비워진다), 지나간
-- 반려는 전부 여기 남는다.

CREATE TABLE public.complaint_returns (
  id BIGSERIAL PRIMARY KEY,
  -- 민원을 지우면 그 이력도 함께 사라진다. 민원 없는 반려 기록은 뜻이 없다.
  complaint_id bigint NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  reason text NOT NULL,
  -- 계정이 지워져도 "그때 누가 반려했다"는 남아야 해서 이름을 함께 적어 둔다.
  returned_by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  returned_by text NOT NULL,
  returned_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 한 건의 반려 이력을 시간 순으로 읽는다.
CREATE INDEX idx_complaint_returns_complaint
  ON public.complaint_returns (complaint_id, returned_at);

-- 앱은 서버에서 service_role 키로 붙는다. service_role은 RLS를 지나치므로
-- 정책 없이 켜 두는 것이 이 프로젝트의 방식이다.
ALTER TABLE public.complaint_returns ENABLE ROW LEVEL SECURITY;
