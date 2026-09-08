-- 민원이 지사를 오간 이력.
--
-- 되돌린 것만 남기던 표(complaint_bounces)를 **오간 것 전부**로 넓힌다.
-- 지사가 되돌린 것만 남으면 "그래서 관리자가 어디로 옮겼나"가 사라져,
-- 한 건이 몇 군데를 돌았는지 되짚을 수 없다. 민원 행에는 지금 지사 하나만
-- 남으므로 옮기는 순간 앞의 지사는 덮인다.
--
-- 아직 한 줄도 없어(개발·운영 모두 0건) 그대로 다시 만든다.
DROP TABLE IF EXISTS public.complaint_bounces;

CREATE TABLE public.complaint_transfers (
  id BIGSERIAL PRIMARY KEY,
  complaint_id bigint NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  /*
   * 무슨 일이었나.
   *   auto    접수·수정 때 배포 기록에서 찾아 저절로 갔다
   *   assign  담당 지사를 못 찾은 건을 관리자가 정했다
   *   move    이미 지사에 가 있던 건을 관리자가 다른 지사로 옮겼다
   *   bounce  그 지사가 "우리 건이 아니다"로 관리자에게 되돌렸다
   */
  kind text NOT NULL CHECK (kind IN ('auto', 'assign', 'move', 'bounce')),
  -- 어디서 왔나. 처음 배정이면 비어 있다.
  from_group text,
  -- 어디로 갔나. 되돌린 것이면 비어 있다(관리자 앞).
  to_group text,
  -- 왜. 되돌릴 때는 반드시 있고, 저절로 간 것은 찾은 방법이 들어간다.
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  by_name text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_complaint_transfers_complaint ON public.complaint_transfers (complaint_id, at);
ALTER TABLE public.complaint_transfers ENABLE ROW LEVEL SECURITY;
