-- 313 (2026-10-05): alarma que sí ve una lentitud "moderada" de la ubicación por WhatsApp
-- (señal 4b de ag_health_check, por mediana) y registro de qué pasó con el barrio que se
-- busca después de responder (barrio_tarde, lo escribe ag-whatsapp).
ALTER TABLE public.ag_wa_location_latency ADD COLUMN IF NOT EXISTS barrio_tarde text;

CREATE OR REPLACE FUNCTION public.ag_health_check()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_supabase_url    TEXT;
  v_service_key     TEXT;
  v_resend_key      TEXT;
  v_max_conn        int;
  v_active_conn     int;
  v_conn_pct        numeric;
  v_stuck_searching int;
  v_recent_errors   int;
  v_slow_locations  int;
  v_max_location_ms int;
  v_mediana_ms      int;
  v_muestras        int;
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

  -- señal 4 (nueva 2026-08-28): un pasajero mandó su ubicación por WhatsApp y
  -- el bot tardó más de 3 segundos en responder -- umbral generoso (lo normal
  -- medido en producción es 0.5-1.5s), pensado para agarrar justo el tipo de
  -- caso reportado ("tarda demasiado en cargar la ubicación") sin generar
  -- ruido por variaciones normales de red.
  SELECT count(*), max(ms) INTO v_slow_locations, v_max_location_ms
  FROM public.ag_wa_location_latency
  WHERE created_at > now() - interval '15 minutes' AND ms > 3000;
  IF v_slow_locations >= 1 THEN
    v_alerts := array_append(v_alerts, format(
      '📍 %s ubicación(es) de pasajero tardaron más de 3s en procesarse en los últimos 15 min (peor caso: %sms) -- revisa Mapbox y los logs de ag-whatsapp.',
      v_slow_locations, v_max_location_ms));
  END IF;

  -- señal 4b (2026-10-05): la respuesta NORMAL se volvió lenta. La señal 4 (>3 s) no vio
  -- la regresión del 2026-10-03: las ubicaciones quedaron en 1,5-2,7 s, lentas para el
  -- pasajero pero por debajo de 3 s, y pasaron 2 días hasta que el usuario lo notó.
  -- Mediana de las últimas 5 ubicaciones de pasajeros en 24 h (ignora un arranque en frío
  -- suelto). Lo normal tras el arreglo: 0,6-0,7 s. respuesta_ms = cuando el pasajero ya
  -- tiene la respuesta; solo existe desde el arreglo (las filas viejas no cuentan, para no
  -- avisar por la lentitud que ya se corrigió).
  SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY t)::int
    INTO v_muestras, v_mediana_ms
  FROM (
    SELECT respuesta_ms AS t
    FROM public.ag_wa_location_latency
    WHERE created_at > now() - interval '24 hours' AND respuesta_ms IS NOT NULL
      AND coalesce(barrio_tarde, '') <> 'soporte'
    ORDER BY created_at DESC LIMIT 5
  ) u;
  IF v_muestras >= 3 AND v_mediana_ms > 1200 THEN
    v_watch := concat_ws(E'
', v_watch, format(
      '📍 La respuesta a la ubicación por WhatsApp se volvió lenta: %s ms de mediana en las últimas %s (lo normal es 600-700 ms). Revisa geo_ms vs respuesta_ms en ag_wa_location_latency y corre velocidad_ubicacion_test.ts.',
      v_mediana_ms, v_muestras));
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
              'data', jsonb_build_object('context', 'Monitoreo (aviso temprano)', 'message', v_watch)),
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
              'subject', '👀 Movi -- aviso temprano', 'text', v_watch),
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
$function$;
