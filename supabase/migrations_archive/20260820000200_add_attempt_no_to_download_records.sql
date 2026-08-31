-- 다운로드 한도가 "카운트를 읽고 → 나중에 기록을 쓴다" 구조라, 동시에 두 번 요청하면
-- 둘 다 한도 검사를 통과해 1회 권한으로 2번 받을 수 있었다.
-- 회차 번호에 유니크 제약을 걸어 DB가 중복 선점을 거부하게 한다.
ALTER TABLE public.download_records
  ADD COLUMN IF NOT EXISTS attempt_no INTEGER;

-- 기존 기록에 (유저, 파일)별 회차를 시간순으로 채운다.
WITH numbered AS (
  SELECT id,
         row_number() OVER (PARTITION BY user_id, file_id ORDER BY downloaded_at, id) AS rn
  FROM public.download_records
  WHERE user_id IS NOT NULL
)
UPDATE public.download_records dr
SET attempt_no = n.rn
FROM numbered n
WHERE dr.id = n.id AND dr.attempt_no IS NULL;

-- 같은 회차를 두 번 잡을 수 없게 한다. 동시 요청 하나는 여기서 반드시 실패한다.
-- admin은 기록을 남기지 않아 영향이 없고, user_id가 없는 과거 행은 대상에서 뺀다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_download_records_user_file_attempt
  ON public.download_records(user_id, file_id, attempt_no)
  WHERE user_id IS NOT NULL AND attempt_no IS NOT NULL;
