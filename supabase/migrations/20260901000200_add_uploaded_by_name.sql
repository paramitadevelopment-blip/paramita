-- 업로드한 사람의 이름을 그때 값 그대로 남긴다.
--
-- files.uploaded_by는 users.id를 참조하고 ON DELETE SET NULL이다. 계정을
-- 지우면 누가 올렸는지가 통째로 사라진다. 다운로드 로그·로그인 기록·재다운로드
-- 요청은 전부 그때 이름을 같이 저장해서 이 문제를 피해 왔는데, files만
-- 그렇게 안 되어 있었다.
--
-- deleted_files에도 같이 둔다. 파일을 지우면 그쪽으로 복사되는데, 거기 없으면
-- 삭제 히스토리를 볼 때 업로더 정보가 비어 있게 된다.
ALTER TABLE public.files ADD COLUMN uploaded_by_name text;
ALTER TABLE public.deleted_files ADD COLUMN uploaded_by_name text;
