-- Create file_distributions table
CREATE TABLE IF NOT EXISTS public.file_distributions (
  id BIGSERIAL PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  department_id BIGINT NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  classified_count BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(file_id, department_id)
);

-- Enable RLS
ALTER TABLE public.file_distributions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view file_distributions"
  ON public.file_distributions
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin to insert file_distributions"
  ON public.file_distributions
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow admin to update file_distributions"
  ON public.file_distributions
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Create index for faster queries
CREATE INDEX idx_file_distributions_file_id ON public.file_distributions(file_id);
CREATE INDEX idx_file_distributions_department_id ON public.file_distributions(department_id);
