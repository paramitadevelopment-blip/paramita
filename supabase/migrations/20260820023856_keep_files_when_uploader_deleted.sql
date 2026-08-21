-- 사용자를 지우면 그 사람이 올린 파일까지 DB가 함께 지우고 있었다(ON DELETE CASCADE).
-- 파일 업로드는 관리자만 하므로, 관리자 계정 하나를 정리하는 순간 전체 파일이 날아간다.
-- 게다가 이 삭제는 DB가 직접 하는 것이라 애플리케이션의 삭제 절차를 건너뛴다 —
-- deleted_files로 옮기지도, 삭제 이벤트를 남기지도 않아 복구할 방법이 없다.
-- 파일은 올린 사람과 수명이 다르다. 업로더만 비우고 파일은 남긴다.

ALTER TABLE public.files
  ALTER COLUMN uploaded_by DROP NOT NULL;

ALTER TABLE public.files
  DROP CONSTRAINT files_uploaded_by_fkey;

ALTER TABLE public.files
  ADD CONSTRAINT files_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- 삭제·복구는 이 값을 그대로 주고받는다. 한쪽만 NULL을 막으면 업로더가 비워진
-- 파일을 지울 때 삭제가 실패한다.
ALTER TABLE public.deleted_files
  ALTER COLUMN uploaded_by DROP NOT NULL;
