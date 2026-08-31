-- 로그인 기록.
--
-- 고객 이름·전화번호·주민번호 앞자리가 든 시스템인데 누가 언제 어디서
-- 들어왔는지 남는 게 없었다. 계정이 새어도 알아챌 방법이 없다.
--
-- 실패한 시도도 남긴다. 성공만 남기면 사고가 난 뒤에나 쓸모가 있는데,
-- 실패 기록이 있으면 사고 전에 알아챌 수 있다 — 새벽에 모르는 IP에서
-- 스무 번 틀렸다면 그게 신호다.
--
-- 로그아웃은 남기지 않는다. 버튼을 안 누르고 창을 닫는 경우가 대부분이라
-- 열이 거의 비고, 빈 값이 "안 나갔다"인지 "안 눌렀다"인지 구분이 안 된다.
CREATE TABLE public.login_records (
  id BIGSERIAL PRIMARY KEY,

  -- 누가.
  -- 없는 아이디로 시도하면 user_id 가 없다. 그래도 어떤 아이디로 시도했는지는
  -- 남아야 하므로 username 은 입력값을 그대로 적는다.
  user_id BIGINT,
  username TEXT NOT NULL,
  -- 그때의 이름·소속·역할을 복사해 둔다. 나중에 소속을 옮기거나 계정을 지워도
  -- 그 시점 기록은 그대로여야 한다 (download_records 와 같은 방식).
  user_name TEXT,
  user_department TEXT,
  user_role TEXT,

  -- 결과
  success BOOLEAN NOT NULL,
  fail_reason TEXT,

  -- 어디서
  ip_address TEXT,
  device_type TEXT,
  os_name TEXT,
  browser_name TEXT,

  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 영구 보존이라 계속 쌓인다. 조회 세 갈래를 처음부터 인덱스로 받쳐 둔다.
CREATE INDEX idx_login_user ON public.login_records(user_id, logged_in_at DESC);
CREATE INDEX idx_login_time ON public.login_records(logged_in_at DESC);
CREATE INDEX idx_login_failed ON public.login_records(success, logged_in_at DESC);

ALTER TABLE public.login_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view" ON public.login_records
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert" ON public.login_records
  FOR INSERT TO authenticated WITH CHECK (true);
