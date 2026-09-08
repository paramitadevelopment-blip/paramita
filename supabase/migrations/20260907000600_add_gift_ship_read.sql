-- 배송 정보를 지사가 확인했다.
--
-- 담당자가 발주 뒤 택배사·운송장번호를 채우면, 그것을 기다리던 쪽은 신청한 지사다.
-- 지금은 상태만 '배송 정보 입력됨'으로 바뀔 뿐이라, 지사가 목록을 다시 훑지 않으면
-- 언제 채워졌는지 알 길이 없었다. 민원의 read_at과 같은 뜻으로 한 칸을 둔다 —
-- 지사가 [확인]을 눌러야 배지에서 내려간다.
--
-- 담당자가 배송 정보를 고치면 이 칸을 다시 비운다. 바뀐 값은 다시 봐야 한다.

ALTER TABLE public.gift_requests
  ADD COLUMN IF NOT EXISTS ship_read_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ship_read_by text;
