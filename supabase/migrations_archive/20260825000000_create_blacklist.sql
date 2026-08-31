CREATE TABLE public.blacklist (
  id BIGSERIAL PRIMARY KEY,
  -- 비교용 정규화 값
  product_key TEXT NOT NULL,
  birth_key   TEXT NOT NULL,
  phone_keys  TEXT[] NOT NULL,
  -- 표시용 원본 값
  customer_name TEXT,
  product_name  TEXT NOT NULL,
  birth TEXT,
  tel1 TEXT,
  tel2 TEXT,
  -- 판정 이유
  reason TEXT NOT NULL,
  request_count INT NOT NULL,
  source_file_id   UUID REFERENCES public.files(id) ON DELETE SET NULL,
  source_file_name TEXT,
  -- 등록/해제 이력
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 상품+생년월일로 먼저 좁힌 뒤 번호 겹침을 본다
CREATE INDEX idx_blacklist_identity ON public.blacklist(product_key, birth_key);
CREATE INDEX idx_blacklist_phones   ON public.blacklist USING GIN(phone_keys);
-- 해제되지 않은 것만 활성 목록
CREATE INDEX idx_blacklist_active   ON public.blacklist(released_at);

-- RLS
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view" ON public.blacklist
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admin can insert" ON public.blacklist
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Only admin can update" ON public.blacklist
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Only admin can delete" ON public.blacklist
  FOR DELETE TO authenticated USING (true);
