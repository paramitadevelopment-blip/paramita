-- 다운로드 기록이 어느 화면에서 일어났는지. 파일 다운로드 화면과 파일전달
-- 화면 둘 다 같은 download_records 표에 기록을 남기지만, 지금은 구분이
-- 없어 다운로드 로그에서 어디서 받았는지 알 수 없다.
--
-- 기존 행은 전부 파일 다운로드 화면에서 난 기록이라 'download'가 맞다.
-- 파일전달 화면(/api/file-transfer/[id])만 앞으로 'file_transfer'로 남긴다.
ALTER TABLE public.download_records
  ADD COLUMN source text NOT NULL DEFAULT 'download'
  CHECK (source IN ('download', 'file_transfer'));
