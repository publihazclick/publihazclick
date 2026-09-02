-- 253: que TODO conductor registrado reciba todas las solicitudes
--
-- Regla de negocio confirmada por el usuario 2026-09-02: apenas alguien se registra como
-- conductor queda habilitado para recibir solicitudes -- sin papeles, sin aprobacion y sin
-- saldo. Los documentos se le piden DESPUES de su primer viaje, para poder hacer el segundo
-- (eso ya funciona: al completar el primero pasa a 'pending_docs' y queda bloqueado hasta
-- completar el registro). La prioridad es que hagan su primer viaje cuanto antes.
--
-- El reparto NO estaba cumpliendo esa regla. Medido con datos reales sobre 45 conductores:
--   40 tienen notificaciones push activas
--   29 abrieron la app en los ultimos 7 dias
--    6 la abrieron en las ultimas 24 horas
--    3 podian recibir una solicitud en ese momento   <-- a estos les hablaba el sistema
-- La causa: la rama de push exigia ubicacion actualizada en las ultimas 4 HORAS. Un conductor
-- que se registro ayer y no abrio la app hoy no recibia absolutamente nada, aunque tuviera la
-- app instalada, el push activo y estuviera libre para trabajar. Por eso la solicitud real de
-- anoche solo le llego a 4 conductores de 45.
--
-- Tres cambios:
--   1. La ventana de ubicacion pasa de 4 horas a 7 dias (alcanza 26 en vez de 3).
--   2. Rama nueva para quien tiene push pero NO tiene ubicacion utilizable -- 13 conductores
--      reales que nunca habian recibido una sola solicitud. Sin filtro de distancia, porque no
--      hay contra que medirla. Deliberado: es mucho peor que nadie vea la solicitud a que la
--      vea alguien lejos, que simplemente no oferta.
--   3. La segunda ronda de despacho comparaba el vehiculo SIN contemplar domicilio/fletes/
--      ciudad, asi que para esos servicios el reintento no avisaba a nadie. Ahora usa el mismo
--      criterio que la primera ronda.
--
-- Alcance esperado: de 3 a 40 conductores por solicitud (los 5 restantes no tienen ninguna
-- suscripcion push registrada -- eso se resuelve del lado de la app, no aqui).

CREATE OR REPLACE FUNCTION public.ag_notify_drivers_on_trip_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
  v_driver_ids   uuid[];
  v_price_fmt    TEXT;
  v_payload      jsonb;
  v_origin_geog  extensions.geography;
BEGIN
  IF NEW.status <> 'searching' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN NEW; END IF;

  v_price_fmt := '$' || to_char(NEW.offered_price, 'FM999G999G999');
  v_origin_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.origin_lng, NEW.origin_lat), 4326)::extensions.geography;

  SELECT ARRAY_AGG(DISTINCT uid) INTO v_user_ids FROM (

    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.is_online = true
      AND d.status IN ('approved', 'quick', 'pending')
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '10 minutes'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)

    UNION

    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id
      AND ps.provider = 'fcm'
      AND ps.fcm_token IS NOT NULL
    WHERE d.status IN ('approved', 'quick', 'pending')
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '7 days'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)

    UNION

    -- Rama 3 (2026-09-02): conductor con push activo del que NO tenemos ubicacion utilizable
    -- (nunca la registro, o la ultima es de hace mas de 7 dias). Sin esta rama quedaban
    -- completamente fuera del reparto: eran 13 de 45 conductores reales, gente registrada,
    -- con la app instalada y las notificaciones activas, a la que NUNCA le llegaba una sola
    -- solicitud. No se puede filtrar por distancia porque justamente no hay contra que
    -- medirla; se asume que quien se registro en Movi esta en la ciudad donde opera. Es
    -- deliberado: la regla del negocio es que TODO conductor registrado reciba todas las
    -- solicitudes para poder hacer su primer viaje cuanto antes, y es mucho peor que nadie
    -- vea la solicitud a que la vea alguien lejos (que simplemente no oferta).
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id
      AND ps.provider = 'fcm'
      AND ps.fcm_token IS NOT NULL
    LEFT JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    WHERE d.status IN ('approved', 'quick', 'pending')
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND (dl.driver_id IS NULL OR dl.updated_at <= NOW() - INTERVAL '7 days')
  ) sub;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Registrar a quiénes se les manda -- por auth_user_id, traducido a driver_id real.
  BEGIN
    SELECT ARRAY_AGG(DISTINCT d.id) INTO v_driver_ids
    FROM public.ag_drivers d
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE u.auth_user_id::text = ANY(v_user_ids);

    IF v_driver_ids IS NOT NULL THEN
      INSERT INTO public.ag_trip_push_log (trip_request_id, driver_id, round)
      SELECT NEW.id, did, 0 FROM unnest(v_driver_ids) AS did;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  v_payload := jsonb_build_object(
    'user_ids', v_user_ids,
    'title',    'Nueva solicitud · ' || v_price_fmt,
    'body',     COALESCE(NEW.origin_name, 'Origen sin nombre') || ' → ' || NEW.dest_name
                || E'\n' || v_price_fmt || ' · ' || round(NEW.distance_km::numeric, 1) || ' km',
    'url',      '/anda-gana?trip_request_id=' || NEW.id::text,
    'tag',      'trip-' || NEW.id::text,
    'urgent',   true,
    'trip_id',  NEW.id::text,
    'price',    NEW.offered_price::text,
    'dist',     round(NEW.distance_km::numeric, 1)::text,
    'origin',   COALESCE(NEW.origin_name, 'Origen sin nombre'),
    'dest',     NEW.dest_name
  );

  BEGIN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/ag-send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := v_payload,
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$
;

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
