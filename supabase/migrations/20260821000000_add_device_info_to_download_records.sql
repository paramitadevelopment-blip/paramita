-- 다운로드 로그에 기기/OS/브라우저/IP 정보 추가
-- 사용자의 접속 환경을 추적하기 위함 (보안/분석)
ALTER TABLE public.download_records
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS device_type TEXT,
  ADD COLUMN IF NOT EXISTS os_name TEXT,
  ADD COLUMN IF NOT EXISTS browser_name TEXT;

-- IP 주소로 검색할 수 있도록 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_download_records_ip_address
  ON public.download_records(ip_address);

-- 기기 종류로 집계할 수 있도록 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_download_records_device_type
  ON public.download_records(device_type);
