-- DB담당자 계정의 소속. 관리자 계정 소속이 '관리자'인 것과 같은 자리다.
--
-- is_admin 플래그는 재사용하지 않는다. 원본 파일 저장 위치 등 "관리자 소속이
-- 어디인지"를 그 플래그로 찾는 코드가 있는데, 두 번째로 true인 행이 생기면
-- 그 코드가 둘 중 어느 쪽을 골라야 할지 알 수 없게 된다. 화면·API에서 이
-- 소속을 감추는 건 이름으로 한다(lib/departments.ts의 isHiddenDepartment).
INSERT INTO public.departments (name, group_name, is_admin)
VALUES ('DB담당자', 'DB담당자', false)
ON CONFLICT (name) DO NOTHING;
