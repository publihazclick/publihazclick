-- 254: el segundo push abria la app pero no mostraba la solicitud
--
-- Reportado por el usuario 2026-09-02: "la segunda notificacion push al tocarla lleva a la app
-- pero no muestra el modal".
--
-- Causa real (no es el push ni el codigo nativo): el payload del segundo aviso ya traia todo lo
-- necesario -- trip_id, url, precio, origen y destino -- e igual que el primero pasa por
-- showFullScreenTripNotification y por _showIncomingTripById. El problema es de tiempos: la app
-- solo muestra solicitudes cuyo driver_visible_since tenga menos de 240 segundos (ver
-- getSearchingRequests en anda-gana.service.ts y el barrido periodico en el componente), y este
-- reintento se dispara justo a los 4 minutos de creada la solicitud. Cuando el conductor tocaba
-- el segundo push, _showIncomingTripById la agregaba a la lista y el barrido la sacaba en el
-- acto por vencida. La app abria y no aparecia nada.
--
-- El arreglo es reabrir la ventana de visibilidad al reenviar el aviso, que es lo unico
-- coherente: si le estamos volviendo a avisar a los conductores, la solicitud tiene que poder
-- verse. Mismo patron que ya usa 'Seguir buscando' (migracion 241) por la misma razon; ahi se
-- corrigio solo ese camino y este quedo con el defecto.
--
-- Solo se reabre si de verdad se le mando el push a alguien (v_matched > 0). Si no habia ningun
-- conductor a quien avisar, no tiene sentido revivir la solicitud en pantalla.

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
        AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = r.vehicle_type
             OR r.vehicle_type IN ('domicilio','fletes','ciudad'))
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
        AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = r.vehicle_type
             OR r.vehicle_type IN ('domicilio','fletes','ciudad'))
        AND COALESCE(d.notify_new_requests, true) = true
        AND dl.updated_at > NOW() - INTERVAL '7 days'
        AND extensions.ST_DWithin(dl.geog, v_origin_geog, 30000)
      UNION

      -- Rama 3 (2026-09-02): mismo criterio que en ag_notify_drivers_on_trip_request -- ver alli
      -- el porque. Conductor con push activo del que no hay ubicacion utilizable.
      SELECT u.auth_user_id::text AS uid
      FROM public.ag_drivers d
      JOIN public.ag_users u ON u.id = d.ag_user_id
      JOIN public.ag_push_subs ps
        ON ps.user_id = u.auth_user_id AND ps.provider = 'fcm' AND ps.fcm_token IS NOT NULL
      LEFT JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
      WHERE d.status IN ('approved', 'quick', 'pending')
        AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = r.vehicle_type
             OR r.vehicle_type IN ('domicilio','fletes','ciudad'))
        AND COALESCE(d.notify_new_requests, true) = true
        AND (dl.driver_id IS NULL OR dl.updated_at <= NOW() - INTERVAL '7 days')
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

    -- driver_visible_since = now() es LA linea que hace que el segundo push sirva de algo.
    -- La app descarta toda solicitud cuyo driver_visible_since tenga mas de 240 segundos, y
    -- este reintento se dispara justo a los 4 minutos: el push llegaba, el conductor lo tocaba,
    -- la app abria, _showIncomingTripById metia la solicitud en la lista... y el barrido
    -- periodico la sacaba en el acto por vencida. Resultado: abria la app y no aparecia nada.
    -- Reenviar el aviso sin reabrir la ventana de visibilidad no tiene ningun sentido.
    -- Es exactamente el mismo bug que ya se corrigio el 2026-08-30 para 'Seguir buscando'
    -- (migracion 241), que reinicia este mismo reloj por el mismo motivo -- ahi se arreglo solo
    -- ese camino y este quedo con el defecto.
    UPDATE public.ag_trip_requests
    SET dispatch_retry_round = 1,
        dispatch_round1_matched = v_matched,
        driver_visible_since = CASE WHEN v_matched > 0 THEN now() ELSE driver_visible_since END
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
