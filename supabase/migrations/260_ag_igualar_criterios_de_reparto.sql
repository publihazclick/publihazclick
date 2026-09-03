-- 260: los tres repartos de una solicitud usan los mismos criterios
--
-- Una solicitud se le manda a los conductores en tres momentos, y cada uno lo hacia con
-- reglas distintas, asi que a cada tanda le llegaba a un grupo diferente de gente:
--
--                                   1a tanda      reintento 3min   "Seguir buscando"
--   radio                           20 km         30 km            20 km
--   antiguedad del GPS (rama 2)     7 dias        7 dias           4 HORAS
--   incluye a los que no tienen     si            si               NO
--     ubicacion utilizable
--   cuenta 'sedan' como carro       si            si               NO
--
-- El "Seguir buscando" era el mas pobre de los tres: el pasajero pedia expresamente seguir
-- buscando y su solicitud le llegaba a MENOS conductores que la notificacion inicial. Los dos
-- conductores con vehicle_type='sedan' quedaban fuera por comparacion directa de tipo, sin el
-- CASE que las otras dos funciones si tienen.
--
-- Ahora las tres usan lo mismo: 30 km, GPS de hasta 7 dias, rama de los que no tienen
-- ubicacion, y sedan contando como carro. Regla del negocio: TODO conductor registrado recibe
-- TODAS las solicitudes, en cualquiera de las tres tandas.
--
-- Nota sobre el radio: hoy no cambia a nadie, los 32 conductores con ubicacion estan dentro de
-- 8 km del centro de Cucuta. Se iguala para que las tres se comporten igual el dia que la
-- operacion crezca, no porque hoy falte alguien.
--
-- Lo que hoy SI deja gente fuera no es un filtro: 6 de los 21 conductores de carro no tienen
-- token de notificaciones (nunca activaron los avisos en el telefono). A esos no hay reparto
-- que los alcance; es un permiso del dispositivo, no una regla del sistema.
--
-- Aplicado en produccion el 2026-09-02 por Management API.

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
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 30000)

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
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 30000)

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

CREATE OR REPLACE FUNCTION public.ag_rebroadcast_trip_request(p_trip_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
  v_price_fmt    TEXT;
  v_origin_geog  extensions.geography;
  v_req          RECORD;
BEGIN
  SELECT * INTO v_req FROM public.ag_trip_requests WHERE id = p_trip_id AND status = 'searching';
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Reinicia la ventana de visibilidad del conductor -- sin esto, el push llega pero la app
  -- descarta la solicitud de inmediato por considerarla "vieja" (ver comentario arriba).
  -- wa_stale_check_round = 0: sin esto, apretar "Seguir buscando" reabria la solicitud para
  -- los conductores pero NO reiniciaba el ciclo de avisos al pasajero, que estaba topado en 3
  -- rondas contadas desde la creacion. Resultado real (2026-09-02): el pasajero apretaba
  -- "Seguir buscando", recibia "te avisamos apenas alguien acepte" y se quedaba en silencio
  -- para siempre. Ahora cada vez que pide seguir buscando vuelve a tener sus avisos.
  UPDATE public.ag_trip_requests
  SET driver_visible_since = now(),
      wa_stale_check_round = 0,
      wa_stale_check_sent_at = now()
  WHERE id = p_trip_id;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN 0; END IF;

  v_price_fmt := '$' || to_char(v_req.offered_price, 'FM999G999G999');
  v_origin_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(v_req.origin_lng, v_req.origin_lat), 4326)::extensions.geography;

  SELECT ARRAY_AGG(DISTINCT uid) INTO v_user_ids FROM (
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.is_online = true
      AND d.status IN ('approved', 'quick', 'pending')
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = v_req.vehicle_type
           OR v_req.vehicle_type IN ('domicilio','fletes','ciudad'))
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
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = v_req.vehicle_type
           OR v_req.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '7 days'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 30000)
    UNION

    -- Rama 3 (2026-09-02): conductor con push activo del que NO tenemos ubicacion
    -- utilizable (nunca la registro, o la ultima es vieja). Esta rama ya existia en la
    -- primera tanda y en el reintento, pero aqui no: el "Seguir buscando" del pasajero
    -- terminaba llegandole a MENOS conductores que la notificacion inicial, que es justo
    -- lo contrario de lo que se busca. No se filtra por distancia porque no hay contra que
    -- medirla; se asume que quien se registro en Movi esta en la ciudad donde opera.
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id AND ps.provider = 'fcm' AND ps.fcm_token IS NOT NULL
    WHERE d.status IN ('approved', 'quick', 'pending')
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = v_req.vehicle_type
           OR v_req.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND NOT EXISTS (
        SELECT 1 FROM public.ag_driver_locations dl2
        WHERE dl2.driver_id = d.id AND dl2.updated_at > NOW() - INTERVAL '7 days'
      )
  ) sub;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN RETURN 0; END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/ag-send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body    := jsonb_build_object(
        'user_ids', v_user_ids,
        'title',    'Nueva solicitud · ' || v_price_fmt,
        'body',     COALESCE(v_req.origin_name, 'Origen sin nombre') || ' → ' || v_req.dest_name
                    || E'\n' || v_price_fmt || ' · ' || round(v_req.distance_km::numeric, 1) || ' km',
        'url',      '/anda-gana?trip_request_id=' || v_req.id::text,
        'tag',      'trip-' || v_req.id::text,
        'urgent',   true,
        'trip_id',  v_req.id::text,
        'price',    v_req.offered_price::text,
        'dist',     round(v_req.distance_km::numeric, 1)::text,
        'origin',   COALESCE(v_req.origin_name, 'Origen sin nombre'),
        'dest',     v_req.dest_name
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN array_length(v_user_ids, 1);
END;
$function$
;
