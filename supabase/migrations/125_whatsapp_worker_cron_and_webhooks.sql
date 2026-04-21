-- =============================================================================
-- 125: Automatic WhatsApp — cron job worker + webhooks delivery receipts
-- ----------------------------------------------------------------------------
-- Problema diagnosticado:
--   * wa-campaign-worker nunca se ejecuta → los mensajes "pendientes" nunca
--     salen (las campañas quedan "running" para siempre).
--   * No había webhook para recibir confirmaciones de entrega/lectura de
--     Evolution API → las estadisticas de delivered/read/failed nunca se
--     actualizan en produccion.
--
-- Esta migracion:
--   1. Añade columnas para correlacionar mensajes con eventos del webhook.
--   2. Configura pg_cron (+ pg_net) para invocar wa-campaign-worker cada 2 min
--      como red de seguridad (además del disparo inmediato en start_campaign).
--   3. Extiende wa_sessions con updated_at + connected_at.
-- =============================================================================

-- ── 1) Columnas nuevas ───────────────────────────────────────────────────────
ALTER TABLE public.wa_campaign_messages
  ADD COLUMN IF NOT EXISTS evolution_message_id TEXT,
  ADD COLUMN IF NOT EXISTS read_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at            TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_wa_msg_evo_id
  ON public.wa_campaign_messages (evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;

ALTER TABLE public.wa_sessions
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;


-- ── 2) pg_cron job para wa-campaign-worker cada 2 min ───────────────────────
-- Usa pg_net.http_post con el service role key para autenticarse.

-- Función helper que obtiene el JWT de servicio desde el vault (o la define
-- explícitamente si no está en el vault). Si el valor no está definido,
-- el cron job fallará silenciosamente pero no afecta nada más.
DO $$
DECLARE
  v_svc_key TEXT;
  v_base    TEXT;
BEGIN
  -- Intentar leer de pg_settings; si no está, usar variables vacías y el job
  -- quedará configurado pero necesitará credenciales para ejecutarse.
  BEGIN
    v_svc_key := current_setting('app.supabase_service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    v_svc_key := NULL;
  END;

  BEGIN
    v_base := current_setting('app.supabase_url', true);
  EXCEPTION WHEN OTHERS THEN
    v_base := NULL;
  END;

  -- No-op aquí: las credenciales se configuran vía ALTER DATABASE ... SET
  -- o a traves de Supabase dashboard > Database > Extensions.
  RAISE NOTICE 'Service key/url presence: key=%, url=%',
    CASE WHEN v_svc_key IS NULL OR v_svc_key = '' THEN 'MISSING' ELSE 'OK' END,
    CASE WHEN v_base    IS NULL OR v_base    = '' THEN 'MISSING' ELSE 'OK' END;
END $$;

-- Eliminar job previo si existe
SELECT cron.unschedule('wa-campaign-worker')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-campaign-worker');

-- Crear job cada 2 min
SELECT cron.schedule(
  'wa-campaign-worker',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1) || '/functions/v1/wa-campaign-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body    := jsonb_build_object('trigger', 'cron'),
    timeout_milliseconds := 30000
  );
  $cron$
);


-- ── 3) Trigger updated_at en wa_sessions ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_sessions_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'connected' THEN
    NEW.connected_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_sessions_touch_updated_at ON public.wa_sessions;
CREATE TRIGGER trg_wa_sessions_touch_updated_at
  BEFORE UPDATE ON public.wa_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.wa_sessions_touch_updated_at();


-- ── 4) Verificación ──────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-campaign-worker'),
    'cron job wa-campaign-worker missing';
END $$;
