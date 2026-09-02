-- 20260902000200에서 넣었던 컬럼을 되돌린다.
--
-- 삭제한 사람의 이름은 삭제 시점에 스냅샷으로 남기지 않고, 조회할 때
-- deleted_by(아이디)로 users에서 찾아 붙이기로 했다. 그래야 이 컬럼이
-- 생기기 전에 쌓인 삭제 이력에도 이름이 같이 보인다.
ALTER TABLE public.file_deletion_events
  DROP COLUMN IF EXISTS deleted_by_name;
