-- 주문번호 없는 신청 — 관리자 확인 대기.
--
-- 지금까지는 배포 기록에 없는 주문번호면 신청 자체를 받지 않았다. 그런데 실제로는
-- 기록에 없는 고객에게도 사은품이 나가야 하는 일이 있다(번호를 모르는 채로 상담이
-- 끝났거나, 기록에 아직 안 들어온 건). 그런 건을 문 앞에서 막아 버리면 지사는
-- 시스템 밖에서 처리하게 되고, 그러면 누가 왜 보냈는지 되짚을 길이 없어진다.
--
-- 그래서 받아 두되 **관리자 확인을 거치게** 한다. 확인 전에는 담당자에게 가지
-- 않는다 — 지사 안에서만 오간다.
--
-- 기록이 없는 건이므로 고객명·전화번호를 기록에서 채울 수 없다. 그 두 칸은
-- 지사가 손으로 적고, 관리자가 그 값을 보고 판정한다. source_file_id가 비어
-- 있다는 것이 곧 "기록에서 오지 않았다"는 표시다.

ALTER TABLE public.gift_requests
  -- 관리자가 확인했다. 확인 뒤에는 보통의 신청('지사 전달 대기')이 된다.
  ADD COLUMN IF NOT EXISTS checked_by text,
  ADD COLUMN IF NOT EXISTS checked_at timestamp with time zone;

-- 'pending_check'(관리자 확인 대기)가 새로 생긴다. 신청의 첫 자리가 둘로 갈린다:
-- 기록에서 온 건은 'requested', 기록 없이 들어온 건은 'pending_check'.
ALTER TABLE public.gift_requests DROP CONSTRAINT IF EXISTS gift_requests_status_check;
ALTER TABLE public.gift_requests
  ADD CONSTRAINT gift_requests_status_check
  CHECK (status IN ('pending_check', 'requested', 'forwarded', 'ordered', 'shipped', 'supplement', 'withdrawn'));

-- 관리자 화면은 "확인 대기"만 훑는다. 전 지사가 대상이라 소속 없이 상태로만 센다.
CREATE INDEX IF NOT EXISTS idx_gift_requests_status_created
  ON public.gift_requests (status, created_at DESC);

-- 주문번호는 이제 비어 있을 수 있다. 기록이 없는 건은 적을 번호가 없다.
ALTER TABLE public.gift_requests ALTER COLUMN order_no DROP NOT NULL;
