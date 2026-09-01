-- 직급 명칭을 '담당자'에서 'DB담당자'로 바꾼다.
--
-- 이전 마이그레이션(20260901000100)이 이미 '담당자'로 넣어 둔 소속 행과,
-- 그 사이 만들어졌을 수 있는 계정의 소속 값을 함께 옮긴다. UNIQUE(name)이라
-- 두 값이 동시에 존재할 수 없으므로 UPDATE로 이름만 바꾼다 — 지우고 새로
-- 만들면 그사이 만들어진 계정의 department가 어디에도 없는 소속을 가리키게 된다.
UPDATE public.departments
SET name = 'DB담당자', group_name = 'DB담당자'
WHERE name = '담당자';

UPDATE public.users
SET department = 'DB담당자'
WHERE department = '담당자';
