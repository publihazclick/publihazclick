-- Extiende ag_push_subs para soportar tokens FCM nativos (además de Web Push)
ALTER TABLE public.ag_push_subs
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'webpush',
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;

ALTER TABLE public.ag_push_subs
  ALTER COLUMN endpoint DROP NOT NULL,
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth DROP NOT NULL;

ALTER TABLE public.ag_push_subs
  DROP CONSTRAINT IF EXISTS ag_push_subs_endpoint_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ag_push_webpush_endpoint
  ON public.ag_push_subs(endpoint)
  WHERE provider = 'webpush' AND endpoint IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ag_push_fcm_token
  ON public.ag_push_subs(fcm_token)
  WHERE provider = 'fcm' AND fcm_token IS NOT NULL;

-- RPC para registrar un token FCM (upsert por user_id + token)
CREATE OR REPLACE FUNCTION public.ag_register_fcm_token(p_token TEXT, p_user_agent TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 20 THEN
    RAISE EXCEPTION 'Token FCM inválido';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.ag_push_subs (user_id, provider, fcm_token, user_agent, last_used_at)
  VALUES (auth.uid(), 'fcm', p_token, p_user_agent, now())
  ON CONFLICT (fcm_token) WHERE provider = 'fcm' AND fcm_token IS NOT NULL
  DO UPDATE SET user_id = EXCLUDED.user_id, last_used_at = now(), user_agent = EXCLUDED.user_agent;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ag_register_fcm_token(TEXT, TEXT) TO authenticated;
