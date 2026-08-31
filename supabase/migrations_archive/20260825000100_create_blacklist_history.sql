CREATE TABLE public.blacklist_history (
  id BIGSERIAL PRIMARY KEY,
  blacklist_id BIGINT NOT NULL REFERENCES public.blacklist(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_blacklist_history_blacklist_id ON public.blacklist_history(blacklist_id);
CREATE INDEX idx_blacklist_history_created_at ON public.blacklist_history(created_at DESC);

ALTER TABLE public.blacklist_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view" ON public.blacklist_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admin can insert" ON public.blacklist_history
  FOR INSERT TO authenticated WITH CHECK (true);
