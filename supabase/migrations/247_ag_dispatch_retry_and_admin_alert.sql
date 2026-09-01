-- Migration 247: segundo disparo de push + aviso al admin por WhatsApp (2026-09-01)
--
-- Pedido explicito del usuario: (1) monitorear que a TODOS los conductores les esten
-- llegando los push de cada solicitud, avisandole por WhatsApp si algo falla; (2) un
-- "segundo disparo" en caso de que el primer push no haya llegado.
--
-- Diseno (cron cada 1 minuto, ag_check_and_retry_dispatch):
--   Ronda 1 (3 min sin ninguna oferta): reenvia el push de "nueva solicitud" a los
--     conductores que califiquen EN ESE MOMENTO -- mismo criterio del trigger original
--     (ag_notify_drivers_on_trip_request) pero con el radio ampliado a 30km (vs 20km)
--     para darle una segunda oportunidad real si la cobertura cerca del origen era baja,
--     no solo repetir la misma búsqueda que ya fallo. Un envio FCM nuevo (tag distinto)
--     es una notificacion nueva para el telefono, no un duplicado descartado -- le da al
--     conductor una segunda oportunidad real aunque la primera se haya perdido (Doze,
--     red, o cualquier falla puntual del lado del telefono).
--   Ronda 2 (6 min totales sin ninguna oferta, ya con el reintento hecho): un viaje real
--     que sigue sin nadie interesado pese a 2 intentos es la señal de negocio real de que
--     "los conductores no se estan enterando" -- ahi SI se justifica avisar a un humano.
--     Manda WhatsApp al admin via el mismo canal que ya usa reportTripError() en el
--     frontend (ag-whatsapp, event=error_alert, plantilla aprobada trip_error_alert),
--     una sola vez por viaje (dispatch_alerted_at).
--
-- No se alerta solo por "0 conductores encontrados" al crear la solicitud -- eso puede
-- ser real (no hay nadie cerca a esa hora), no necesariamente un bug. La señal confiable
-- es que un viaje real siga sin ofertas pese al reintento.

ALTER TABLE public.ag_trip_requests
  ADD COLUMN IF NOT EXISTS dispatch_retry_round integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_round1_matched integer,
  ADD COLUMN IF NOT EXISTS dispatch_alerted_at timestamptz;

CREATE OR REPLACE FUNCTION public.ag_check_and_retry_dispatch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r              RECORD;
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
  v_origin_geog  extensions.geography;
  v_matched      integer;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN; END IF;

  -- ── Ronda 1: reintento a los 3 minutos ──────────────────────────────────
  FOR r IN
    SELECT tr.*
    FROM public.ag_trip_requests tr
    WHERE tr.status = 'searching'
      AND tr.dispatch_retry_round = 0
      AND tr.created_at <= now() - interval '3 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.ag_trip_offers o WHERE o.trip_request_id = tr.id)
  LOOP
    v_origin_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(r.origin_lng, r.origin_lat), 4326)::extensions.geography;

    SELECT ARRAY_AGG(DISTINCT uid) INTO v_user_ids FROM (
      SELECT u.auth_user_id::text AS uid
      FROM public.ag_drivers d
      JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
      JOIN public.ag_users u ON u.id = d.ag_user_id
      WHERE d.is_online = true
        AND d.status IN ('approved', 'quick', 'pending')
        AND (CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = r.vehicle_type
        AND COALESCE(d.notify_new_requests, true) = true
        AND dl.updated_at > NOW() - INTERVAL '10 minutes'
        AND extensions.ST_DWithin(dl.geog, v_origin_geog, 30000)  -- radio ampliado (30km vs 20km del primer intento)

      UNION

      SELECT u.auth_user_id::text AS uid
      FROM public.ag_drivers d
      JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
      JOIN public.ag_users u ON u.id = d.ag_user_id
      JOIN public.ag_push_subs ps
        ON ps.user_id = u.auth_user_id AND ps.provider = 'fcm' AND ps.fcm_token IS NOT NULL
      WHERE d.status IN ('approved', 'quick', 'pending')
        AND (CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = r.vehicle_type
        AND COALESCE(d.notify_new_requests, true) = true
        AND dl.updated_at > NOW() - INTERVAL '4 hours'
        AND extensions.ST_DWithin(dl.geog, v_origin_geog, 30000)
    ) sub;

    v_matched := COALESCE(array_length(v_user_ids, 1), 0);

    IF v_matched > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url     := v_supabase_url || '/functions/v1/ag-send-push',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
          body    := jsonb_build_object(
            'user_ids', v_user_ids,
            'title',    '🔔 Solicitud esperando · $' || to_char(r.offered_price, 'FM999G999G999'),
            'body',     COALESCE(r.origin_name, 'Origen sin nombre') || ' → ' || r.dest_name,
            'url',      '/anda-gana?trip_request_id=' || r.id::text,
            'tag',      'trip-retry-' || r.id::text,
            'urgent',   true,
            'trip_id',  r.id::text,
            'price',    r.offered_price::text,
            'dist',     round(r.distance_km::numeric, 1)::text,
            'origin',   COALESCE(r.origin_name, 'Origen sin nombre'),
            'dest',     r.dest_name
          ),
          timeout_milliseconds := 5000
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    UPDATE public.ag_trip_requests
    SET dispatch_retry_round = 1, dispatch_round1_matched = v_matched
    WHERE id = r.id;
  END LOOP;

  -- ── Ronda 2: aviso al admin a los 6 minutos si sigue sin ofertas ────────
  FOR r IN
    SELECT tr.*
    FROM public.ag_trip_requests tr
    WHERE tr.status = 'searching'
      AND tr.dispatch_retry_round = 1
      AND tr.dispatch_alerted_at IS NULL
      AND tr.created_at <= now() - interval '6 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.ag_trip_offers o WHERE o.trip_request_id = tr.id)
  LOOP
    BEGIN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'to',    'admin',
          'event', 'error_alert',
          'data',  jsonb_build_object(
            'context', 'Solicitud sin ofertas tras 6 min (2 intentos)',
            'message', COALESCE(r.vehicle_type,'?') || ' · $' || r.offered_price::text || ' · ' ||
                       COALESCE(r.origin_name, 'origen desconocido') ||
                       ' · conductores encontrados en el reintento: ' || COALESCE(r.dispatch_round1_matched::text, '0')
          )
        ),
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

    UPDATE public.ag_trip_requests SET dispatch_alerted_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'movi-check-retry-dispatch',
  '* * * * *',
  'SELECT public.ag_check_and_retry_dispatch();'
);
