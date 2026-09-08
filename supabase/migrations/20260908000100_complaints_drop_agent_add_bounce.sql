-- 민원에서 설계사 단계를 뺀다. 지사가 받아서 지사가 처리한다.
--
-- 화면에서 설계사 지정 버튼이 사라진 뒤로 이 단계는 아무도 못 밟는데,
-- 상태·탭·배지 계산에는 그대로 남아 자리만 차지했다. 개발·운영 모두
-- status='agent'인 건과 agent_id가 든 건은 0건이다.
--
-- 함께, 지사가 "우리 지사 건이 아니다"라고 관리자에게 되돌릴 수 있게
-- 그 기록 표를 만든다. 잘못 간 민원이 그 지사가 억지로 닫는 것 말고는
-- 갈 데가 없었다.

-- 1) 혹시 남아 있으면 지사 단계로 되돌린다(0건 예상).
UPDATE public.complaints SET status = 'branch' WHERE status = 'agent';

-- 2) 상태에서 agent를 뺀다.
ALTER TABLE public.complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_status_check
  CHECK (status IN ('unassigned', 'branch', 'done', 'returned', 'withdrawn'));

-- 3) 설계사 칸을 지운다.
DROP INDEX IF EXISTS public.idx_complaints_agent;
ALTER TABLE public.complaints
  DROP COLUMN IF EXISTS agent_id,
  DROP COLUMN IF EXISTS agent_name,
  DROP COLUMN IF EXISTS agent_assign_type,
  DROP COLUMN IF EXISTS agent_assigned_by,
  DROP COLUMN IF EXISTS agent_assigned_at;

-- 4) 지사가 관리자에게 되돌린 기록. 민원 행의 값은 되돌릴 때마다 비워지므로
--    지워지지 않는 자리에 따로 남긴다(보완 이력 complaint_returns와 같은 꼴).
CREATE TABLE IF NOT EXISTS public.complaint_bounces (
  id BIGSERIAL PRIMARY KEY,
  complaint_id bigint NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  -- 어느 지사가 되돌렸나. 그 지사에 다시 보내지 않으려면 알아야 한다.
  from_group text NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) <= 500),
  bounced_by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  bounced_by text NOT NULL,
  bounced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complaint_bounces_complaint ON public.complaint_bounces (complaint_id);
ALTER TABLE public.complaint_bounces ENABLE ROW LEVEL SECURITY;
