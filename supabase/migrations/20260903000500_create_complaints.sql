-- 민원.
--
-- 민원담당자가 메일로 받은 내역을 화면에 옮겨 적으면, 그 고객을 직전에 받았던
-- 지사를 찾아 넘긴다. 지사가 소속 설계사를 고르고, 설계사가 처리 내용을 적는다.
-- 올린 민원담당자와 관리자는 그 결과를 그대로 본다.
--
-- 한 건이 거치는 자리(status):
--   unassigned  담당 지사를 못 찾음 — 관리자가 지정하거나 반려한다
--   branch      지사에 넘어감. 아직 설계사가 정해지지 않음
--   agent       설계사가 정해짐. 처리 전
--   done        처리 완료 (handled_note 에 내용이 있다)
--   returned    민원담당자에게 반려됨 (return_reason 에 사유가 있다)
--
-- 배정이 두 단계(지사·설계사)라 '어떻게 배정됐는지'도 단계마다 따로 남긴다.
-- 지금은 설계사 배정이 전부 수동이지만, 나중에 자동배정을 붙이면 그때부터
-- 값이 갈린다. 자리를 나중에 만들면 이미 쌓인 건들은 빈 채로 남아
-- "옛날 건은 무엇이었나"를 되짚을 수 없게 된다.

CREATE TABLE public.complaints (
  id BIGSERIAL PRIMARY KEY,

  -- ── 메일로 오는 내역 그대로 ──────────────────────────────────
  product text,                      -- 주문 대표상품
  customer_name text NOT NULL,       -- 수령인 이름
  phone text,                        -- 전화번호
  -- 하이픈을 넣거나 빼서 적어도 같은 사람으로 찾아야 한다.
  -- 재신청 알림(reapply_notices.phone_keys)과 같은 방식이다.
  phone_keys text[] NOT NULL DEFAULT '{}',
  order_no text,                     -- 주문번호
  received_at date,                  -- 접수일자
  order_confirmed_at date,           -- 발주확인일
  called_at timestamp with time zone,-- 통화일시
  call_memo text,                    -- 통화내역

  -- ── 1단계: 지사 배정 ────────────────────────────────────────
  assigned_group text,               -- 조직명(departments.group_name)
  assign_type text CHECK (assign_type IN ('auto', 'manual')),
  assigned_by text,                  -- 수동일 때 지정한 사람(username)
  assigned_at timestamp with time zone,
  -- 무엇으로 그 고객을 찾았는지. 나중에 "왜 이 지사로 갔나"를 되짚는 근거다.
  match_key text CHECK (match_key IN ('order_no', 'name_phone')),
  -- 근거가 된 직전 배정 건. 파일이 지워져도 민원은 남아야 하므로 SET NULL.
  source_file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  source_file_name text,
  previous_applied_at timestamp with time zone,

  -- ── 2단계: 설계사 배정 ──────────────────────────────────────
  -- 계정이 지워져도 "그때 누가 맡았다"는 기록은 남아야 해서 이름을 함께 적어 둔다.
  agent_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  agent_name text,
  agent_assign_type text CHECK (agent_assign_type IN ('auto', 'manual')),
  agent_assigned_by text,
  agent_assigned_at timestamp with time zone,

  -- ── 처리 ────────────────────────────────────────────────────
  status text NOT NULL DEFAULT 'unassigned'
    CHECK (status IN ('unassigned', 'branch', 'agent', 'done', 'returned')),
  handled_note text,
  handled_by text,
  handled_at timestamp with time zone,

  -- ── 반려 ────────────────────────────────────────────────────
  return_reason text,
  returned_by text,
  returned_at timestamp with time zone,

  -- ── 접수 ────────────────────────────────────────────────────
  created_by_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  created_by text NOT NULL,          -- 넣은 사람(username)
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 지사·설계사는 자기 것만 본다. 관리자는 미배정 건을 먼저 본다.
CREATE INDEX idx_complaints_group_status ON public.complaints (assigned_group, status);
CREATE INDEX idx_complaints_agent ON public.complaints (agent_id, status);
-- 민원담당자는 자기가 넣은 것만 최신순으로 본다.
CREATE INDEX idx_complaints_created_by ON public.complaints (created_by_id, created_at DESC);
-- 같은 고객의 민원을 찾을 때 쓴다.
CREATE INDEX idx_complaints_order_no ON public.complaints (order_no);
CREATE INDEX idx_complaints_phones ON public.complaints USING gin (phone_keys);

-- 앱은 서버에서 service_role 키로 붙는다. service_role은 RLS를 지나치므로
-- 정책 없이 켜 두는 것이 이 프로젝트의 방식이다 — 다른 경로로 들어오는
-- 접근은 전부 막히고, 권한 판단은 API 라우트에서 한다.
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
