-- 사용자의 소속은 조직 단위('파라인슈')이고 departments 행은 배정 분류('파라인슈1')다.
-- 기존 함수는 분류명으로 사용자를 세고 옮겨서, 쪼개진 조직에서는 늘 0명이 잡혔다.
-- 그 상태로 마지막 분류까지 지우면 사용자의 소속이 가리키는 분류가 사라져
-- 파일이 한 건도 안 보이게 되는데, 화면은 "영향 없음"이라고 알려준다.
--
-- 규칙: 같은 그룹에 다른 분류가 남아 있으면 사용자는 영향이 없다.
--       마지막 하나를 지울 때만 사용자를 옮겨야 한다.
CREATE OR REPLACE FUNCTION public.delete_department_with_migration(
  p_dept_id bigint,
  p_new_dept_name character varying,
  p_actor character varying
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_name varchar;
  v_old_group varchar;
  v_new_dept_id bigint;
  v_new_group varchar;
  v_siblings int := 0;
  v_user_count int := 0;
  v_file_count int := 0;
BEGIN
  SELECT name, group_name INTO v_old_name, v_old_group
  FROM departments WHERE id = p_dept_id;

  IF v_old_name IS NULL THEN
    RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND';
  END IF;

  -- 같은 조직에 남는 다른 분류가 있는가
  SELECT count(*) INTO v_siblings
  FROM departments WHERE group_name = v_old_group AND id <> p_dept_id;

  -- 마지막 분류일 때만 그 조직 소속 사용자가 갈 곳을 잃는다.
  IF v_siblings = 0 THEN
    SELECT count(*) INTO v_user_count FROM users WHERE department = v_old_group;
  END IF;

  SELECT count(*) INTO v_file_count FROM files WHERE department_id = p_dept_id;

  IF v_user_count > 0 OR v_file_count > 0 THEN
    IF p_new_dept_name IS NULL OR btrim(p_new_dept_name) = '' THEN
      RAISE EXCEPTION 'NEW_DEPARTMENT_REQUIRED';
    END IF;

    SELECT id, group_name INTO v_new_dept_id, v_new_group
    FROM departments WHERE name = btrim(p_new_dept_name);

    IF v_new_dept_id IS NULL THEN
      RAISE EXCEPTION 'NEW_DEPARTMENT_NOT_FOUND';
    END IF;

    IF v_new_dept_id = p_dept_id THEN
      RAISE EXCEPTION 'SAME_DEPARTMENT';
    END IF;

    -- 사용자는 조직 단위로 옮긴다. 분류명을 넣으면 그 사용자는 어떤 그룹에도
    -- 걸리지 않아 파일이 안 보이게 된다.
    IF v_user_count > 0 THEN
      INSERT INTO department_change_logs (user_id, from_department, to_department, reason, changed_by)
      SELECT id, v_old_group, v_new_group, 'department_deleted', p_actor
      FROM users
      WHERE department = v_old_group;

      UPDATE users SET department = v_new_group WHERE department = v_old_group;
    END IF;

    UPDATE files SET department_id = v_new_dept_id WHERE department_id = p_dept_id;
  END IF;

  DELETE FROM departments WHERE id = p_dept_id;

  RETURN json_build_object(
    'migratedUsers', v_user_count,
    'migratedFiles', v_file_count
  );
END;
$function$;
