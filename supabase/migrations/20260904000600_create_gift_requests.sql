-- 사은품 신청.
--
-- 설계사가 신청하고, 지사가 골라 사은품담당자에게 전달하고, 사은품담당자가
-- 발주해 배송 정보를 적는다. 세 사람이 한 건을 차례로 넘긴다.
--
-- 신청은 주문번호 하나로 시작한다. 그 번호로 우리가 배포한 기록을 찾아 고객
-- 정보를 끌어오고, 설계사는 나머지 칸만 채운다. **고객명과 전화번호는 기록에서
-- 온 그대로 잠근다** — 사은품이 엉뚱한 사람에게 가는 사고는 대개 이름과 번호를
-- 손으로 옮겨 적다 생긴다.
--
-- 한 건이 거치는 자리(status):
--   requested   설계사가 신청함. 지사가 전달하기 전
--   forwarded   지사가 사은품담당자에게 전달함. 발주 전
--   shipped     사은품담당자가 발주함 (발주일·택배사·운송장번호가 있다)
--   supplement  사은품담당자가 보완을 요청함. 설계사가 고쳐 다시 올린다
--
-- 열 이름은 사은품 발주리스트 엑셀(거래처 양식)의 순서를 그대로 따른다.
-- 나중에 그 엑셀로 내려받을 때 한 줄이 한 행이 되어야 한다.

-- ── 역할 ────────────────────────────────────────────────────
-- 사은품담당자(gift)는 담당자 계열이라 소속이 '담당자'로 고정된다.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'user', 'staff', 'subadmin', 'complaint', 'agent', 'gift'));

-- ── 표 ──────────────────────────────────────────────────────
CREATE TABLE public.gift_requests (
  id BIGSERIAL PRIMARY KEY,

  -- 무엇으로 시작했나. 이 번호로 배포 기록을 찾았다.
  order_no text NOT NULL,
  -- 근거가 된 배포 원본. 파일이 지워져도 신청은 남아야 하므로 SET NULL.
  source_file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  source_file_name text,

  -- ── 발주리스트 열 그대로 ────────────────────────────────────
  order_date date,                 -- 발주일         ← 사은품담당자
  courier text,                    -- 택배사         ← 사은품담당자
  tracking_no text,                -- 운송장번호     ← 사은품담당자
  customer_name text NOT NULL,     -- 고객명         ← 기록에서, 잠금
  phone1 text,                     -- 전화번호1      ← 기록에서, 잠금
  phone2 text,                     -- 전화번호2      ← 기록에서, 잠금
  zip text,                        -- 우편번호       ← 기록에서, 고칠 수 있음
  address text,                    -- 주소           ← 기록에서, 고칠 수 있음
  delivery_memo text,              -- 배송메세지
  gift_name text NOT NULL,         -- 사은품명
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),  -- 수량
  note text,                       -- 비고
  sender_name text,                -- 보내시는분     ← 지사 이름이 기본
  sender_phone text,               -- 보내시는분 연락처
  product text,                    -- 상품명(방송사) ← 기록에서
  customer_no text,                -- 고객번호       ← 기록에서
  counselor text,                  -- 상담원         ← 설계사 이름이 기본
  settlement text,                 -- 정산구분

  -- ── 누가 어디서 ─────────────────────────────────────────────
  -- 계정이 지워져도 "그때 누가 신청했다"는 남아야 해서 이름을 함께 적어 둔다.
  requester_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  requester_name text NOT NULL,
  -- 신청한 사람의 소속 조직(departments.group_name). 지사는 이걸로 자기 것만 본다.
  group_name text NOT NULL,

  -- ── 단계 ────────────────────────────────────────────────────
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'forwarded', 'shipped', 'supplement')),
  forwarded_by text,
  forwarded_at timestamp with time zone,
  shipped_by text,
  shipped_at timestamp with time zone,
  supplement_reason text,
  supplement_by text,
  supplement_at timestamp with time zone,

  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 지사는 자기 소속의 신청을, 사은품담당자는 단계별로 읽는다.
CREATE INDEX idx_gift_requests_group ON public.gift_requests (group_name, status);
CREATE INDEX idx_gift_requests_status ON public.gift_requests (status, created_at);
CREATE INDEX idx_gift_requests_requester ON public.gift_requests (requester_id);
CREATE INDEX idx_gift_requests_order ON public.gift_requests (order_no);

-- 앱은 서버에서 service_role 키로 붙는다. service_role은 RLS를 지나치므로
-- 정책 없이 켜 두는 것이 이 프로젝트의 방식이다.
ALTER TABLE public.gift_requests ENABLE ROW LEVEL SECURITY;
