-- 배정 규칙을 코드가 아니라 표에 둔다.
--
-- 지금까지는 어느 지역이 어느 지사로 가는지가 lib/insurance.ts의 상수
-- (DEPT_BY_REGION, REGION_PATTERNS, REGION_CHOICES)에 박혀 있었다. 지사가
-- 늘거나 담당 지역이 바뀔 때마다 코드를 고치고 배포해야 했다.
--
-- 지역과 나이를 따로 담는다. 판정은 둘을 AND로 본다 — 경기지사가 '서울'과
-- '70세미만'을 골랐다면 서울에서 온 70~75세 건은 경기지사 대상이 아니다.
-- 한 표에 (지역, 나이) 쌍으로 담으면 지역 10개 × 나이 3개 = 30행이 되어,
-- 화면에서 체크 하나 바꿀 때마다 무엇을 지우고 넣을지가 복잡해진다.
--
-- 소속은 조직 단위(departments.group_name)로 적는다. 파일이 실제로 붙는
-- 배정 분류(파라인슈1·파라인슈2)가 아니라 사람이 아는 이름(파라인슈)이다.
-- 하위 분류는 배정이 정해진 뒤 나이로 고른다.
--
-- 초기 데이터는 넣지 않는다. 설정하기 전에는 모든 건이 예외로 빠져 사람이
-- 고르게 되므로 배포가 막히지 않는다. 예전 규칙을 몰래 넣어두면 "설정한 적도
-- 없는데 왜 이렇게 갔지"가 된다.

CREATE TABLE public.assignment_region_rules (
  id BIGSERIAL PRIMARY KEY,
  -- departments.group_name 을 가리킨다. 외래키를 걸지 않는 이유:
  -- group_name 은 UNIQUE 가 아니다(파라인슈1·파라인슈2가 같은 값을 갖는다).
  department_group text NOT NULL,
  region text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  -- 같은 칸을 두 번 체크한 상태가 없도록. 화면은 체크박스라 켜짐/꺼짐 둘뿐이다.
  CONSTRAINT assignment_region_rules_unique UNIQUE (department_group, region)
);

CREATE TABLE public.assignment_age_rules (
  id BIGSERIAL PRIMARY KEY,
  department_group text NOT NULL,
  -- lib/assignmentRules.ts 의 AgeBracket 과 같은 값만 받는다. 오타가 들어오면
  -- 그 소속은 아무 건도 못 받는데 화면상으로는 설정된 것처럼 보인다.
  age_bracket text NOT NULL CHECK (age_bracket IN ('under70', '70to75', 'over75')),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT assignment_age_rules_unique UNIQUE (department_group, age_bracket)
);

-- 규칙이 마지막으로 바뀐 때.
--
-- 분류(미리보기)와 배포는 반드시 같은 규칙을 봐야 한다. 분류해 놓고 확인하는
-- 사이에 다른 사람이 설정을 바꾸면, 화면에 보인 것과 실제로 나가는 것이 갈린다.
-- 분류가 이 값을 함께 내려주고 배포가 대조해서, 달라졌으면 배포를 막는다.
--
-- 한 행만 두면 되므로 id를 1로 못 박는다.
CREATE TABLE public.assignment_rules_meta (
  id smallint PRIMARY KEY CHECK (id = 1),
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by text
);

INSERT INTO public.assignment_rules_meta (id, updated_at, updated_by)
VALUES (1, now(), NULL);

-- 앱은 서버에서 service_role 키로 붙는다. service_role 은 RLS를 지나치므로
-- 정책이 없어도 앱에서는 읽고 쓸 수 있고, 정책이 없다는 건 "클라이언트가 직접
-- 붙어서는 아무것도 못 한다"는 뜻이다. 다른 표들과 같은 기준이다.
ALTER TABLE public.assignment_region_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_age_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_rules_meta ENABLE ROW LEVEL SECURITY;
