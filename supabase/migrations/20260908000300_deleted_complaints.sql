-- 관리자가 지운 민원의 보관본.
--
-- 관리자(admin·subadmin)는 상태와 무관하게 민원을 지울 수 있다. 잘못 들어간
-- 개인정보나 시험 삼아 넣은 건은 닫아 두는 것으로 안 되고 없애야 한다.
--
-- 다만 그냥 지우면 보완 이력·배정 이력까지 함께 사라진다(둘 다 CASCADE).
-- 그 셋을 통째로 한 줄에 담아 둔다 — 파일 삭제(deleted_files)와 같은 방식이다.
-- 되돌리는 기능은 없다. "무엇을 누가 왜 지웠나"에 답할 수 있으면 된다.
CREATE TABLE IF NOT EXISTS public.deleted_complaints (
  id BIGSERIAL PRIMARY KEY,
  -- 지워진 민원의 원래 번호. 이 표에는 외래키를 걸지 않는다 — 가리킬 행이 없다.
  complaint_id bigint NOT NULL,
  -- 민원 한 줄 통째로. 열이 늘어도 이 표는 안 고쳐도 된다.
  snapshot jsonb NOT NULL,
  -- 그 건에 딸려 있던 보완 이력과 배정 이력.
  returns jsonb NOT NULL DEFAULT '[]'::jsonb,
  transfers jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text NOT NULL CHECK (char_length(reason) <= 500),
  deleted_by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_by text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deleted_complaints_at ON public.deleted_complaints (deleted_at DESC);
ALTER TABLE public.deleted_complaints ENABLE ROW LEVEL SECURITY;
