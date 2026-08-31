-- 재신청 고객 알림.
--
-- 30일 중복이나 블랙리스트로 배정에서 빠진 건을, 그 사람을 직전에 받았던
-- 지사에게 남긴다. 지금은 이런 건이 조용히 사라져서 지사는 자기 고객이
-- 다시 신청한 것을 알 방법이 없다.
CREATE TABLE public.reapply_notices (
  id BIGSERIAL PRIMARY KEY,

  -- 누구인가
  customer_name TEXT,
  birth TEXT,
  tel1 TEXT,
  tel2 TEXT,
  phone_keys TEXT[] NOT NULL,
  product_name TEXT,

  -- 이번에 어떻게 됐나
  reason TEXT NOT NULL,
  order_no TEXT,
  source_file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  source_file_name TEXT,
  applied_at TIMESTAMPTZ NOT NULL,

  -- 직전에 어느 지사로 갔었나
  --
  -- 파일에는 배정 분류('파라인슈1')로 적히는데 사용자 소속은 조직명('파라인슈')이다.
  -- 배포할 때 한 번 변환해 둬야 조회가 단순하고, 나중에 소속 이름이 바뀌어도
  -- 그때 어디로 갔었는지가 그대로 남는다.
  assigned_dept  TEXT NOT NULL,
  assigned_group TEXT NOT NULL,
  assigned_at    TIMESTAMPTZ,
  assigned_file_id   UUID REFERENCES public.files(id) ON DELETE SET NULL,
  assigned_file_name TEXT,

  -- 지사가 봤나
  read_at TIMESTAMPTZ,
  read_by BIGINT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 지사는 자기 소속의 안 읽은 건을 먼저 본다. 사이드바 배지도 이 조회를 쓴다.
CREATE INDEX idx_reapply_group ON public.reapply_notices(assigned_group, read_at);
-- 전화번호로 찾는다. 사람이 하이픈을 넣거나 빼서 검색하므로 숫자만 담아 둔다.
CREATE INDEX idx_reapply_phones ON public.reapply_notices USING GIN(phone_keys);

ALTER TABLE public.reapply_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view" ON public.reapply_notices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert" ON public.reapply_notices
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update" ON public.reapply_notices
  FOR UPDATE TO authenticated USING (true);
