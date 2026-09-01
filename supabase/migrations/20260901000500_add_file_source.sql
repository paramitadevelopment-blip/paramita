-- 원본 파일의 출처. 파일전달로 들어온 것과 관리자가 직접 올린 것을 가른다.
--
-- 지금까지 두 화면(파일전달 '업로드 내역', 원본파일 관리)이 같은 files 행을
-- 필터만 다르게 걸어 보고 있었다. 그래서 파일전달에 올리면 배포 전인데도
-- 원본파일 관리에 같이 뜨고, 파일전달에서 지우면 원본파일 관리에서도 사라졌다.
-- 두 화면은 개념이 다르므로 행 자체를 갈라 준다.
--
-- 기존 행은 전부 관리자가 파일업로드 화면에서 직접 올린 것이라 'direct'가 맞다.
ALTER TABLE public.files
  ADD COLUMN source text NOT NULL DEFAULT 'direct'
  CHECK (source IN ('direct', 'file_transfer'));

-- 삭제하면 메타데이터가 이쪽으로 복사되고, 복구하면 files로 되돌아간다.
-- 여기 없으면 복구된 파일의 출처가 사라져 엉뚱한 화면에 나타난다.
ALTER TABLE public.deleted_files
  ADD COLUMN source text NOT NULL DEFAULT 'direct'
  CHECK (source IN ('direct', 'file_transfer'));
