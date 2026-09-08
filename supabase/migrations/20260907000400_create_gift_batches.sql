-- 신청 묶음 — 지사가 사은품담당자에게 보내는 폴더.
--
-- 지사는 며칠에 걸쳐 건을 모은다. 월요일에 2건, 수요일에 2건을 넣고 금요일에
-- 한 번에 보내려면 "저 4건이 한 묶음"을 머릿속에 두어야 했다. 폴더가 있으면
-- 그 기억이 화면에 남고, 보내기 전에 한 번 훑어볼 수 있다.
--
-- 담당자가 거래처에 보내는 '발주 묶음'(gift_orders)과는 다른 것이다.
--   신청 묶음  지사 → 담당자.  한 지사의 건만.  이름을 붙인다
--   발주 묶음  담당자 → 거래처. 여러 지사가 섞인다. 엑셀 한 장
--
-- 묶음은 문이 아니라 꼬리표다. 보완으로 되돌아온 건은 묶음에서 빠지고, 고쳐
-- 올라오면 다른 묶음에 담긴다. 묶음의 건수는 batch_id로 그때그때 센다.

CREATE TABLE public.gift_batches (
  id BIGSERIAL PRIMARY KEY,
  -- 어느 지사의 묶음인가. 지사는 자기 소속 묶음만 본다.
  group_name text NOT NULL,
  -- 사람이 알아볼 이름. 기본값은 만든 날짜, 고칠 수 있다.
  name text NOT NULL,
  -- 계정이 지워져도 "그때 누가 만들었다"는 남아야 해서 이름을 함께 적어 둔다.
  created_by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  created_by text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  -- 보내기 전(draft)에는 담고 빼고 고친다. 보내면(sent) 잠긴다.
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
  sent_by text,
  sent_at timestamp with time zone
);

CREATE INDEX idx_gift_batches_group ON public.gift_batches (group_name, status, created_at);

-- 앱은 서버에서 service_role 키로 붙는다. 정책 없이 켜 두는 것이 이 프로젝트의 방식이다.
ALTER TABLE public.gift_batches ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.gift_requests
  -- 어느 신청 묶음에 담겼나. 묶음이 지워져도 신청은 남는다.
  ADD COLUMN IF NOT EXISTS batch_id bigint REFERENCES public.gift_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gift_requests_batch_id ON public.gift_requests (batch_id);
