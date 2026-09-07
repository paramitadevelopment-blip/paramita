-- 앞 민원을 따라간 배정도 '찾은 방법'으로 적는다.
--
-- 같은 주문·같은 고객으로 민원이 또 들어오면 배포 기록을 새로 뒤지지 않고
-- 앞 건이 간 지사로 보낸다(그 사이 기록이 바뀌어 다른 지사가 나오면, 받은
-- 쪽은 앞의 사정을 모른 채 처음부터 다시 파악해야 한다).
--
-- 그런데 그것도 '자동으로 정해진 것'이라 근거를 남겨야 한다. 배포 기록에서
-- 찾은 것과 앞 건을 따라간 것은 되짚을 때 다른 이야기이므로, 같은 자리에
-- 다른 이름으로 적는다.

ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_match_key_check;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_match_key_check
  CHECK (match_key IN ('order_no', 'name_phone', 'thread'));
