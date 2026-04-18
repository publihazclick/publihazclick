-- Push subscriptions para Movi
CREATE TABLE IF NOT EXISTS public.ag_push_subs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_push_user ON public.ag_push_subs(user_id);
ALTER TABLE public.ag_push_subs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_push_self" ON public.ag_push_subs;
CREATE POLICY "ag_push_self" ON public.ag_push_subs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
