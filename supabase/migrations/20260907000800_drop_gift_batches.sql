-- 신청 묶음(지사 폴더)을 없앤다.
--
-- 지사가 건을 모아 두었다가 폴더째 보내는 단계를 뺐다. 등록이 곧 전달이라
-- 지사가 넣는 순간 사은품담당자의 발주 대기가 된다. 취합은 담당자가 건을 골라
-- 발주리스트로 묶을 때 한다 — 그쪽(gift_orders)은 그대로다.
--
-- 그래서 '지사 전달 대기'(requested)도 없다. 남아 있는 건은 발주 대기로 옮긴다.
-- 운영에는 아직 사은품 데이터가 없고, 개발에도 시험 데이터뿐이다.

UPDATE public.gift_requests
   SET status = 'forwarded',
       forwarded_at = COALESCE(forwarded_at, created_at),
       forwarded_by = COALESCE(forwarded_by, requester_name)
 WHERE status = 'requested';

ALTER TABLE public.gift_requests DROP CONSTRAINT IF EXISTS gift_requests_status_check;
ALTER TABLE public.gift_requests
  ADD CONSTRAINT gift_requests_status_check
  CHECK (status IN ('pending_check', 'forwarded', 'ordered', 'shipped', 'supplement', 'withdrawn'));

ALTER TABLE public.gift_requests DROP COLUMN IF EXISTS batch_id;
DROP TABLE IF EXISTS public.gift_batches;
