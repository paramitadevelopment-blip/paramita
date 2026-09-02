-- 삭제 이력에 삭제한 사람의 아이디만 남아 누구인지 바로 안 보인다.
-- uploaded_by_name과 같은 이유로 실명을 같이 남긴다 — 계정이 지워져도
-- 그때 이름이 남도록 스냅샷으로 저장한다.
ALTER TABLE public.file_deletion_events
  ADD COLUMN deleted_by_name text;
