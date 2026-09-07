-- 민원을 지사가 '봤다'는 기록을 남긴다.
--
-- 지금은 처리 완료(handled_at)만 있어서, 넘어간 민원을 지사가 보긴 봤는지
-- 아무도 알 수 없다. 상태가 '지사 확인 대기'에서 '처리 완료'로 한 번에
-- 건너뛰기 때문이다. 그 사이에 "봤다"가 있어야
--   - 지사에게 안 본 건수를 배지로 알릴 수 있고
--   - 관리자가 "보고도 안 하는 중"인지 "아예 못 본 것"인지 가를 수 있다
--
-- 재신청 알림(reapply_notices.read_at/read_by)과 같은 자리를 만드는 것이다.
-- 다만 이 표의 방식을 따라 사람은 id와 이름을 함께 남긴다(created_by_id/created_by,
-- agent_id/agent_name과 같은 꼴) — 계정을 지워도 "그때 누가 봤다"는 남아야 한다.

ALTER TABLE public.complaints
  ADD COLUMN read_at timestamp with time zone,
  ADD COLUMN read_by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN read_by text;

-- 지사는 '내 소속의 안 본 건'을 센다. 배지가 이 조회를 쓴다.
CREATE INDEX idx_complaints_group_unread ON public.complaints (assigned_group, read_at);
