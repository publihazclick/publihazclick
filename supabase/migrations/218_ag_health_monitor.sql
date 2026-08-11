-- Migration 218: cron de monitoreo de capacidad para Movi, con alerta doble
-- (WhatsApp + correo) para que el aviso llegue aunque uno de los dos canales falle.
--
-- Parte de la fase de "auto-escalado" pedida por el usuario 2026-08-11 (ver memoria
-- movi_scaling_postgis_indexes): hasta ahora Sentry solo avisaba DESPUÉS de que algo
-- ya se rompía. Esto agrega la capa de "antes" -- revisa cada 15 min señales que
-- indican que el sistema se está acercando a un límite, y si alguna se dispara,
-- manda una alerta por los dos canales de forma independiente.
--
-- Señales revisadas (todas verificables con datos reales, nada especulativo):
--   1. % de conexiones usadas contra el máximo del tier actual de Supabase (hoy
--      "Micro" = 60 conexiones directas) -- la pieza de infraestructura que la
--      auditoría marcó como la única que NO se sube sola.
--   2. Viajes atascados en 'searching' por más de 10 min sin que nadie los tome ni
--      se cancelen -- proxy de que el matching de conductores o el push dejó de
--      funcionar (hoy no existe ningún cron que limpie o avise sobre esto).
--   3. Repunte de errores de viaje ya reportados individualmente vía
--      reportTripError() (tabla ag_admin_notifications, type='trip_error') en los
--      últimos 15 min -- si aparecen 5+ juntos probablemente es un problema
--      sistémico, no casos aislados, y vale la pena una alerta agregada.
--
-- Canal WhatsApp: reusa EXACTO el mismo mecanismo ya probado en producción para
-- errores de viaje (evento 'error_alert' en ag-whatsapp/index.ts, to:'admin',
-- plantilla Meta aprobada 'trip_error_alert' con fallback a texto libre) -- no se
-- construyó nada nuevo de WhatsApp.
-- Canal correo: llamada directa a la API de Resend (mismo API key ya usado en
-- LokomproAqui/ChatVende/LiveCam, dominio remitente publihazclick.com ya
-- verificado), independiente del canal de WhatsApp para que si Meta/WhatsApp
-- falla, el correo de todos modos llegue.
-- Anti-spam: no manda más de una alerta cada 30 min (bandera en platform_settings),
-- para no inundar si una señal se queda encendida varias corridas seguidas.

-- 1. Secret de Resend en el vault de este proyecto (mismo key ya usado en otros
--    proyectos del usuario, dominio publihazclick.com ya verificado en Resend) ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'resend_api_key') THEN
    PERFORM vault.create_secret('REEMPLAZAR_CON_RESEND_API_KEY_REAL', 'resend_api_key', 'Resend API key (compartida, dominio publihazclick.com)');
  END IF;
END $$;

-- 2. Función de chequeo ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ag_health_check()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url    TEXT;
  v_service_key     TEXT;
  v_resend_key      TEXT;
  v_max_conn        int;
  v_active_conn     int;
  v_conn_pct        numeric;
  v_stuck_searching int;
  v_recent_errors   int;
  v_alerts          text[] := ARRAY[]::text[];
  v_message         text;
  v_last_alert_at   timestamptz;
BEGIN
  -- señal 1: % de conexiones usadas
  SELECT count(*) INTO v_active_conn FROM pg_stat_activity;
  v_max_conn := current_setting('max_connections')::int;
  v_conn_pct := round(100.0 * v_active_conn / v_max_conn, 1);
  IF v_conn_pct >= 70 THEN
    v_alerts := array_append(v_alerts, format(
      '🔌 Conexiones a la base de datos al %s%% (%s de %s) -- si sigue subiendo, hay que subir el tier de Supabase.',
      v_conn_pct, v_active_conn, v_max_conn));
  END IF;

  -- señal 2: viajes atascados buscando conductor sin resultado
  SELECT count(*) INTO v_stuck_searching
  FROM public.ag_trip_requests
  WHERE status = 'searching' AND created_at < now() - interval '10 minutes';
  IF v_stuck_searching >= 5 THEN
    v_alerts := array_append(v_alerts, format(
      '🚕 %s viajes llevan más de 10 min buscando conductor sin resultado -- revisa el matching o las notificaciones push.',
      v_stuck_searching));
  END IF;

  -- señal 3: repunte de errores de viaje ya reportados individualmente
  SELECT count(*) INTO v_recent_errors
  FROM public.ag_admin_notifications
  WHERE type = 'trip_error' AND created_at > now() - interval '15 minutes';
  IF v_recent_errors >= 5 THEN
    v_alerts := array_append(v_alerts, format(
      '⚠️ %s errores de viaje reportados en los últimos 15 min -- revisa Sentry, puede ser un problema sistémico.',
      v_recent_errors));
  END IF;

  IF array_length(v_alerts, 1) IS NULL THEN
    RETURN; -- todo dentro de rango, no molestar
  END IF;

  -- anti-spam: máximo una alerta cada 30 min
  SELECT value::timestamptz INTO v_last_alert_at
  FROM public.platform_settings WHERE key = 'ag_health_last_alert_at';
  IF v_last_alert_at IS NOT NULL AND v_last_alert_at > now() - interval '30 minutes' THEN
    RETURN;
  END IF;

  v_message := array_to_string(v_alerts, E'\n');

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO v_resend_key   FROM vault.decrypted_secrets WHERE name = 'resend_api_key' LIMIT 1;

  -- canal 1: WhatsApp (mismo mecanismo probado de error_alert)
  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
        body    := jsonb_build_object(
          'to', 'admin', 'event', 'error_alert',
          'data', jsonb_build_object('context', 'Monitoreo de capacidad', 'message', v_message)
        ),
        timeout_milliseconds := 8000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- canal 2: correo (independiente del canal de WhatsApp)
  IF v_resend_key IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_resend_key),
        body    := jsonb_build_object(
          'from',    'Movi <noreply@publihazclick.com>',
          'to',      ARRAY['publihazclick.com@gmail.com'],
          'subject', '⚠️ Movi -- alerta de capacidad',
          'text',    v_message
        ),
        timeout_milliseconds := 8000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  INSERT INTO public.platform_settings (key, value, updated_at)
  VALUES ('ag_health_last_alert_at', now()::text, now())
  ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
END;
$$;

-- 3. Cron cada 15 minutos -----------------------------------------------------------

SELECT cron.schedule('movi-health-check', '*/15 * * * *', 'SELECT public.ag_health_check();');
