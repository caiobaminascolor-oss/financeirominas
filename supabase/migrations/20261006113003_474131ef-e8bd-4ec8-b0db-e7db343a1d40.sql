ALTER TABLE public.imports
  ADD COLUMN IF NOT EXISTS rows_inserted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_updated integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rows_warning integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS write_mode text NOT NULL DEFAULT 'upsert',
  ADD COLUMN IF NOT EXISTS column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rejected_rows jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS dedup_key text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_dedup_open ON public.alerts (dedup_key) WHERE dedup_key IS NOT NULL AND status = 'ABERTO';
CREATE INDEX IF NOT EXISTS idx_imports_created ON public.imports (created_at DESC);