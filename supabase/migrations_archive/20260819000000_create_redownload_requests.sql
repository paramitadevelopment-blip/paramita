-- Add user_id to download_records
ALTER TABLE public.download_records
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

-- Backfill user_id from downloaded_by (username) lookup
UPDATE public.download_records dr
SET user_id = u.id
FROM public.users u
WHERE dr.user_id IS NULL AND u.username = dr.downloaded_by;

-- Create index for faster (user_id, file_id) queries
CREATE INDEX IF NOT EXISTS idx_download_records_user_file
  ON public.download_records(user_id, file_id);

-- Create redownload_requests table for request/approval queue
CREATE TABLE IF NOT EXISTS public.redownload_requests (
  id BIGSERIAL PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reviewed_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.redownload_requests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view redownload_requests"
  ON public.redownload_requests FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to insert redownload_requests"
  ON public.redownload_requests FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update redownload_requests"
  ON public.redownload_requests FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Create indexes for faster queries
CREATE INDEX idx_redownload_requests_file_user ON public.redownload_requests(file_id, user_id);
CREATE INDEX idx_redownload_requests_status ON public.redownload_requests(status);

-- Prevent duplicate pending requests for same (user_id, file_id)
CREATE UNIQUE INDEX idx_redownload_requests_one_pending
  ON public.redownload_requests(file_id, user_id)
  WHERE status = 'pending';
