-- 명단에 오른 사람의 신청 건을 하나씩 남긴다.
--
-- 지금은 두 값이 서로 다른 데서 온다. 신청횟수(blacklist.request_count)는 등록
-- 시점에 찍고 굳는 숫자라 그 사람이 또 신청해도 안 늘어나고, 화면의 출처 목록은
-- 조회할 때마다 최근 60일 파일을 훑어 만드는 값이라 파일이 지워지거나 60일이
-- 지나면 사라진다. 그래서 '3회' 옆에 두 줄이 뜨는 일이 생긴다.
--
-- 신청 한 건을 한 줄로 여기 남기면 둘이 같은 자리에서 나온다. 횟수는 이 표의
-- 줄 수고 목록도 이 표라, 구조적으로 어긋날 수 없다.
CREATE TABLE public.blacklist_applications (
  id BIGSERIAL PRIMARY KEY,
  blacklist_id BIGINT NOT NULL REFERENCES public.blacklist(id) ON DELETE CASCADE,

  -- 그 파일 안에서 이 신청을 가리키는 값.
  --
  -- 주문번호는 **파일 안에서만** 유니크하다. 파일을 여러 개 모아 놓으면 같은
  -- 번호가 서로 다른 신청을 가리킬 수 있어서, 번호만으로 묶으면 남의 신청과
  -- 뭉개진다. 그래서 아래 UNIQUE는 출처 파일까지 함께 본다.
  order_key TEXT NOT NULL,

  -- 그 행에 적혀 있던 값. 번호만 보고 한 사람으로 묶으므로 이름이 서로 다른 행이
  -- 묶이는 일이 흔하다. 왜 묶였는지 보이려면 그때 값을 그대로 들고 있어야 한다.
  customer_name TEXT,
  product_name  TEXT,

  -- 어느 파일에서 온 신청인가.
  --
  -- files를 참조하는 외래키를 걸지 않는다. 파일을 지우면 deleted_files로 옮겨
  -- 가는데, 외래키가 있으면 그때 NULL이 되어 어느 파일이었는지 잃는다. 명단은
  -- 영구 보관이라 출처도 같이 남아야 하고, id가 남아 있으면 파일 삭제 히스토리에서
  -- 그 파일을 되짚을 수 있다.
  source_file_id   UUID,
  source_file_name TEXT,

  -- 고객이 실제로 신청한 날(접수일자). 우리가 처리한 날이 아니다.
  applied_at  TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 같은 파일의 같은 주문번호는 한 건이다. 한 파일을 두 번 배포해도 부풀지 않는다.
  --
  -- 파일을 함께 보는 이유는 주문번호가 파일 안에서만 유니크하기 때문이다.
  -- NULLS NOT DISTINCT: 출처 파일이 없는 줄(관리자 수동 등록)도 번호가 같으면
  -- 한 건으로 본다. 기본값으로 두면 NULL끼리 서로 다르다고 봐서 같은 건이 쌓인다.
  CONSTRAINT blacklist_applications_file_order_key
    UNIQUE NULLS NOT DISTINCT (blacklist_id, source_file_id, order_key)
);

-- 한 사람의 신청 건을 모아 읽는다. 목록도 횟수도 이 조회를 쓴다.
CREATE INDEX idx_blacklist_applications_blacklist
  ON public.blacklist_applications(blacklist_id);
-- 파일을 지울 때 그 파일에서 온 신청을 찾아본다.
CREATE INDEX idx_blacklist_applications_file
  ON public.blacklist_applications(source_file_id);

ALTER TABLE public.blacklist_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view" ON public.blacklist_applications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert" ON public.blacklist_applications
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update" ON public.blacklist_applications
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete" ON public.blacklist_applications
  FOR DELETE TO authenticated USING (true);
