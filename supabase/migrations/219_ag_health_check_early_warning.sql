-- Migration 219: aviso temprano de conexiones "cerca del 70%", pedido explícito
-- del usuario 2026-08-11 tras preguntar el costo de subir el tier de Supabase --
-- quiere enterarse ANTES de llegar al umbral urgente, no solo al cruzarlo.
--
-- Se agrega una segunda franja (55%-69%) que manda un aviso informativo, más
-- suave, separado del alerta urgente que ya existía en >=70%. Usa su propio
-- enfriamiento de 6 horas (en vez de los 30 min del urgente) porque no hace
-- falta insistir cada 15 min mientras el uso se mantenga en esa franja -- es
-- solo para que haya tiempo de planear el upgrade con calma.

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
  v_watch           text;
  v_message         text;
  v_last_alert_at   timestamptz;
  v_last_watch_at   timestamptz;
BEGIN
  SELECT count(*) INTO v_active_conn FROM pg_stat_activity;
  v_max_conn := current_setting('max_connections')::int;
  v_conn_pct := round(100.0 * v_active_conn / v_max_conn, 1);

  -- señal 1a: alerta urgente (igual que antes)
  IF v_conn_pct >= 70 THEN
    v_alerts := array_append(v_alerts, format(
      '🔌 Conexiones a la base de datos al %s%% (%s de %s) -- si sigue subiendo, hay que subir el tier de Supabase.',
      v_conn_pct, v_active_conn, v_max_conn));

  -- señal 1b: aviso temprano, se está acercando al umbral urgente pero todavía no llega
  ELSIF v_conn_pct >= 55 THEN
    v_watch := format(
      '👀 Conexiones a la base de datos al %s%% (%s de %s) -- se está acercando al 70%%. Todavía no es urgente, es buen momento para planear subir de Micro a Small (~$15/mes).',
      v_conn_pct, v_active_conn, v_max_conn);
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

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  SELECT decrypted_secret INTO v_resend_key   FROM vault.decrypted_secrets WHERE name = 'resend_api_key' LIMIT 1;

  -- envío del alerta urgente (cooldown 30 min, como antes)
  IF array_length(v_alerts, 1) IS NOT NULL THEN
    SELECT value::timestamptz INTO v_last_alert_at FROM public.platform_settings WHERE key = 'ag_health_last_alert_at';
    IF v_last_alert_at IS NULL OR v_last_alert_at <= now() - interval '30 minutes' THEN
      v_message := array_to_string(v_alerts, E'\n');

      IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/ag-whatsapp',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
            body := jsonb_build_object('to', 'admin', 'event', 'error_alert',
              'data', jsonb_build_object('context', 'Monitoreo de capacidad', 'message', v_message)),
            timeout_milliseconds := 8000
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      IF v_resend_key IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url := 'https://api.resend.com/emails',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_resend_key),
            body := jsonb_build_object('from', 'Movi <noreply@publihazclick.com>', 'to', ARRAY['publihazclick.com@gmail.com'],
              'subject', '⚠️ Movi -- alerta de capacidad', 'text', v_message),
            timeout_milliseconds := 8000
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      INSERT INTO public.platform_settings (key, value, updated_at) VALUES ('ag_health_last_alert_at', now()::text, now())
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
    END IF;
  END IF;

  -- envío del aviso temprano (cooldown propio de 6 horas, más espaciado)
  IF v_watch IS NOT NULL THEN
    SELECT value::timestamptz INTO v_last_watch_at FROM public.platform_settings WHERE key = 'ag_health_last_watch_at';
    IF v_last_watch_at IS NULL OR v_last_watch_at <= now() - interval '6 hours' THEN

      IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/ag-whatsapp',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
            body := jsonb_build_object('to', 'admin', 'event', 'error_alert',
              'data', jsonb_build_object('context', 'Monitoreo de capacidad (aviso temprano)', 'message', v_watch)),
            timeout_milliseconds := 8000
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      IF v_resend_key IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url := 'https://api.resend.com/emails',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_resend_key),
            body := jsonb_build_object('from', 'Movi <noreply@publihazclick.com>', 'to', ARRAY['publihazclick.com@gmail.com'],
              'subject', '👀 Movi -- se acerca al límite de conexiones', 'text', v_watch),
            timeout_milliseconds := 8000
          );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      INSERT INTO public.platform_settings (key, value, updated_at) VALUES ('ag_health_last_watch_at', now()::text, now())
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now();
    END IF;
  END IF;
END;
$$;
