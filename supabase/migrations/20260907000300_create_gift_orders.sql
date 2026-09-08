-- 발주 묶음.
--
-- 실제 발주리스트는 지사별로 나가지 않는다. 사은품담당자가 여러 지사에서 올라온
-- 건을 모아 거래처에 **한 장으로** 보낸다. 그 "한 장"이 이 표의 한 행이다.
--
-- 묶음은 문이 아니라 꼬리표다. 건은 묶음에서 빠질 수 있고(보완 요청), 고쳐
-- 올라오면 다음 묶음에 실린다. 묶음의 건수는 따로 저장하지 않고 order_id로
-- 세어야 그때그때 맞다.

CREATE TABLE public.gift_orders (
  id BIGSERIAL PRIMARY KEY,
  -- 계정이 지워져도 "그때 누가 보냈다"는 남아야 해서 이름을 함께 적어 둔다.
  created_by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  created_by text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  note text
);

-- 앱은 서버에서 service_role 키로 붙는다. 정책 없이 켜 두는 것이 이 프로젝트의 방식이다.
ALTER TABLE public.gift_orders ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gift_requests
  -- 어느 발주 묶음에 실렸나. 묶음이 지워져도 신청은 남는다.
  ADD COLUMN IF NOT EXISTS order_id bigint REFERENCES public.gift_orders(id) ON DELETE SET NULL,
  -- 담당자가 봤다. 민원의 read_at과 같은 뜻 — 이 뒤로 지사는 못 고친다.
  ADD COLUMN IF NOT EXISTS read_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS read_by text;

CREATE INDEX IF NOT EXISTS idx_gift_requests_order_id ON public.gift_requests (order_id);

-- 'ordered'(발주 보냄)가 새로 생긴다. 발주리스트에 담겨 나갔지만 아직 송장은 없는 상태.
-- 'shipped'는 "택배사·운송장번호가 채워짐"으로 뜻이 좁아진다.
ALTER TABLE public.gift_requests DROP CONSTRAINT IF EXISTS gift_requests_status_check;
ALTER TABLE public.gift_requests
  ADD CONSTRAINT gift_requests_status_check
  CHECK (status IN ('requested', 'forwarded', 'ordered', 'shipped', 'supplement', 'withdrawn'));
