-- 252: las cifras del informe de visibilidad tienen que cuadrar
--
-- Fallo encontrado probando el informe de la migracion 251 con datos reales: contaba con
-- count(DISTINCT driver_id) FILTER (...) sobre las filas sueltas, asi que un conductor con dos
-- rondas -- una con fcm_ok = true y otra todavia sin marcar -- se contaba a la vez en "FCM
-- acepto" y en "sin token". El informe salia con cifras que sumaban mas que el total de
-- apuntados, o sea ilegible justo en el caso para el que se hizo.
--
-- Ahora se agrupa por conductor primero y cada uno cae en UNA sola casilla:
--   'ok'   -> alguna de sus rondas fue aceptada por el proveedor
--   'fail' -> ninguna aceptada y al menos una rechazada
--   'none' -> ninguna se pudo ni intentar (sin suscripcion registrada)
-- Asi ok + fail + none = apuntados, siempre.

CREATE OR REPLACE FUNCTION public.ag_check_and_retry_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r               RECORD;
  v_supabase_url  TEXT;
  v_service_key   TEXT;
  v_user_ids      TEXT[];
  v_driver_ids    uuid[];
  v_origin_geog   extensions.geography;
  v_matched       integer;
  v_total_notified integer;
  v_fcm_ok         integer;
  v_fcm_fail       integer;
  v_sin_token      integer;
  v_foreground     integer;
  v_tapped         integer;
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
        AND extensions.ST_DWithin(dl.geog, v_origin_geog, 30000)

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
        SELECT ARRAY_AGG(DISTINCT d.id) INTO v_driver_ids
        FROM public.ag_drivers d
        JOIN public.ag_users u ON u.id = d.ag_user_id
        WHERE u.auth_user_id::text = ANY(v_user_ids);

        IF v_driver_ids IS NOT NULL THEN
          INSERT INTO public.ag_trip_push_log (trip_request_id, driver_id, round)
          SELECT r.id, did, 1 FROM unnest(v_driver_ids) AS did;
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL; END;

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
  -- Enriquecido: incluye cuántos de los notificados de verdad ABRIERON el push
  -- (ag_trip_push_log.opened_at), para distinguir "nadie lo vio" de "lo vieron y no
  -- les interesó".
  FOR r IN
    SELECT tr.*
    FROM public.ag_trip_requests tr
    WHERE tr.status = 'searching'
      AND tr.dispatch_retry_round = 1
      AND tr.dispatch_alerted_at IS NULL
      AND tr.created_at <= now() - interval '6 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.ag_trip_offers o WHERE o.trip_request_id = tr.id)
  LOOP
    -- Se agrupa POR CONDUCTOR antes de contar. Sin esto, un conductor con varias rondas
    -- (una marcada y otra no) caia en dos casillas a la vez y las cifras no cuadraban con
    -- el total -- detectado probando de verdad el informe, 2026-09-01.
    SELECT count(*),
           count(*) FILTER (WHERE estado = 'ok'),
           count(*) FILTER (WHERE estado = 'fail'),
           count(*) FILTER (WHERE estado = 'none'),
           count(*) FILTER (WHERE vio_en_pantalla),
           count(*) FILTER (WHERE toco)
    INTO v_total_notified, v_fcm_ok, v_fcm_fail, v_sin_token, v_foreground, v_tapped
    FROM (
      SELECT driver_id,
             CASE WHEN bool_or(fcm_ok IS TRUE)  THEN 'ok'
                  WHEN bool_or(fcm_ok IS FALSE) THEN 'fail'
                  ELSE 'none' END                      AS estado,
             bool_or(foreground_at IS NOT NULL)        AS vio_en_pantalla,
             bool_or(tapped_at IS NOT NULL)            AS toco
      FROM public.ag_trip_push_log
      WHERE trip_request_id = r.id
      GROUP BY driver_id
    ) por_conductor;

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
                       ' · apuntados: '                 || COALESCE(v_total_notified::text, '0') ||
                       ' · FCM acepto: '                || COALESCE(v_fcm_ok::text, '0') ||
                       ' · rechazados: '                || COALESCE(v_fcm_fail::text, '0') ||
                       ' · sin token: '                 || COALESCE(v_sin_token::text, '0') ||
                       ' · les aparecio en pantalla: '  || COALESCE(v_foreground::text, '0') ||
                       ' · tocaron la notificacion: '   || COALESCE(v_tapped::text, '0')
          )
        ),
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

    UPDATE public.ag_trip_requests SET dispatch_alerted_at = now() WHERE id = r.id;
  END LOOP;
END;
$function$
;
