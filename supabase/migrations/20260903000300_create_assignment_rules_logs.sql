-- 배정 규칙을 언제 누가 어떻게 바꿨는지 남긴다.
--
-- 지금까지는 assignment_rules_meta에 "마지막으로 바뀐 때" 한 줄만 있었다.
-- 배정이 갑자기 달라졌을 때 "누가 언제 뭘 바꿨나"를 되짚을 방법이 없다 —
-- 규칙은 그날 나가는 DB 전체의 방향을 정하는 값이라 되짚을 수 있어야 한다.
--
-- 바뀐 항목만 적지 않고 그때의 규칙 전체를 통째로 담는다.
-- 차이는 앞 기록과 견주면 언제든 다시 계산할 수 있지만, 스냅샷이 없으면
-- "그때 설정이 어땠는지"를 영영 알 수 없다. 규칙은 소속 수 × 지역 18개
-- 수준이라 한 건이 몇 KB에 그친다.
CREATE TABLE public.assignment_rules_logs (
  id BIGSERIAL PRIMARY KEY,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  -- 저장한 사람의 아이디. 계정이 지워져도 기록은 남아야 하므로 외래키를 걸지 않는다.
  changed_by text,
  -- 화면에 이름으로 보여주기 위해 그때의 실명도 같이 박아 둔다.
  -- 나중에 users에서 찾아오면, 이름이 바뀌었거나 계정이 지워졌을 때 비게 된다.
  changed_by_name text,
  -- 저장 직후의 규칙 전체.
  -- [{ "group": "경기", "regions": ["서울"], "ageBrackets": ["under70"] }, ...]
  rules jsonb NOT NULL,
  CONSTRAINT assignment_rules_logs_rules_is_array CHECK (jsonb_typeof(rules) = 'array')
);

-- 최근 것부터 보여준다. 목록은 늘 시간 역순이다.
CREATE INDEX idx_assignment_rules_logs_changed_at
  ON public.assignment_rules_logs USING btree (changed_at DESC);

-- 다른 표와 같은 기준. service_role로만 붙는다.
ALTER TABLE public.assignment_rules_logs ENABLE ROW LEVEL SECURITY;
