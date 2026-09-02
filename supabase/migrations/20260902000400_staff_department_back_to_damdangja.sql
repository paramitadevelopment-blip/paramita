-- 소속 이름을 'DB담당자'에서 다시 '담당자'로 되돌린다.
--
-- 20260901000300에서 '담당자' → 'DB담당자'로 바꿨는데, 담당자 유형이 앞으로
-- 늘어날 것을 생각하면 방향이 반대였다. 'DB담당자'는 역할(role=staff)의 이름이고,
-- 소속은 그 역할들이 공통으로 쓰는 자리다 — 관리자와 서브관리자가 역할만 다르고
-- 소속은 '관리자'로 같은 것과 같은 구조다.
--
-- 이렇게 두면 담당자 유형이 하나 더 생겨도 소속 행을 새로 만들 필요가 없다.
-- 지금은 역할을 추가하지 않고 자리만 갈라 둔다.
--
-- UNIQUE(name)이라 두 값이 동시에 존재할 수 없으므로 UPDATE로 이름만 바꾼다 —
-- 지우고 새로 만들면 그사이 만들어진 계정의 department가 없는 소속을 가리킨다.
UPDATE public.departments
SET name = '담당자', group_name = '담당자'
WHERE name = 'DB담당자';

UPDATE public.users
SET department = '담당자'
WHERE department = 'DB담당자';
