-- 보완 요청을 받은 건을 '철회'로 닫을 수 있게 한다. 민원과 사은품 둘 다.
--
-- 보완이 내려왔는데 진행할 필요가 없어진 건(잘못 넣은 것, 다른 건과 겹친 것,
-- 고객이 그냥 넘어가겠다는 것)은 지금 나갈 길이 없다. 고쳐서 다시 보내지 않으면
-- 영원히 '보완 요청' 상태로 남고 배지에도 계속 뜬다. 지우는 것은 막아 뒀다 —
-- 지우면 보완 이력까지 사라져 "무엇을 왜 되돌렸나"가 통째로 없어진다.
--
-- 철회는 지우지 않고 닫는 것이다. 민원도, 보완 이력도, 누가 언제 철회했는지도
-- 남는다. 배지에서만 빠진다. 관리자는 철회된 건을 계속 볼 수 있어 "왜 안 하기로
-- 했나"를 되짚을 수 있다.

-- ── 민원 ────────────────────────────────────────────────────
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_status_check
  CHECK (status IN ('unassigned', 'branch', 'agent', 'done', 'returned', 'withdrawn'));

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS withdrawn_by text,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamp with time zone,
  -- 왜 안 하기로 했는지. 비워도 되지만 적어 두면 되짚을 때 답이 된다.
  ADD COLUMN IF NOT EXISTS withdraw_reason text;

-- ── 사은품 ──────────────────────────────────────────────────
ALTER TABLE public.gift_requests DROP CONSTRAINT IF EXISTS gift_requests_status_check;
ALTER TABLE public.gift_requests
  ADD CONSTRAINT gift_requests_status_check
  CHECK (status IN ('requested', 'forwarded', 'shipped', 'supplement', 'withdrawn'));

ALTER TABLE public.gift_requests
  ADD COLUMN IF NOT EXISTS withdrawn_by text,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS withdraw_reason text;
