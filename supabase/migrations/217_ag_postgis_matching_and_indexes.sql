-- Migration 217: PostGIS para el matching de conductores + índices faltantes en
-- ag_trip_requests.
--
-- Motivo: el trigger que busca conductores cercanos a un viaje nuevo (y su gemelo
-- que cancela la notificación cuando el viaje deja de estar disponible) recalculaba
-- distancia Haversine en SQL puro contra CADA fila de ag_driver_locations, sin
-- índice geográfico. Con 1 conductor no se nota; con miles de conductores en línea
-- ese cálculo corre completo, de forma síncrona, dentro del INSERT/UPDATE del
-- viaje. Se reemplaza por PostGIS (columna geography + índice GIST + ST_DWithin),
-- que usa el índice en vez de recorrer toda la tabla. El radio sigue siendo el
-- mismo (20 km) y el resto de cada función queda intacto -- solo cambia CÓMO se
-- calcula la distancia, no el criterio de selección de conductores.
--
-- También se agregan los índices que le faltaban a ag_trip_requests para las
-- columnas que sí se consultan en la práctica (status, driver_id,
-- passenger_user_id, driver_stage, created_at) -- hoy con 354 filas no se nota,
-- pero son sequential scans que se van a poner lentos a medida que crezca el
-- historial de viajes.

-- 1. PostGIS + columna geography generada en ag_driver_locations ------------------

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

ALTER TABLE public.ag_driver_locations
  ADD COLUMN IF NOT EXISTS geog extensions.geography(Point, 4326)
  GENERATED ALWAYS AS (extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography) STORED;

CREATE INDEX IF NOT EXISTS ag_driver_locations_geog_gix
  ON public.ag_driver_locations USING GIST (geog);

-- 2. Índices faltantes en ag_trip_requests -----------------------------------------

CREATE INDEX IF NOT EXISTS ag_trip_requests_status_idx      ON public.ag_trip_requests (status);
CREATE INDEX IF NOT EXISTS ag_trip_requests_driver_id_idx   ON public.ag_trip_requests (driver_id);
CREATE INDEX IF NOT EXISTS ag_trip_requests_passenger_idx   ON public.ag_trip_requests (passenger_user_id);
CREATE INDEX IF NOT EXISTS ag_trip_requests_driver_stage_idx ON public.ag_trip_requests (driver_stage);
CREATE INDEX IF NOT EXISTS ag_trip_requests_created_at_idx  ON public.ag_trip_requests (created_at DESC);
-- viaje activo de un conductor / de un pasajero (patrón más común en la app)
CREATE INDEX IF NOT EXISTS ag_trip_requests_driver_status_idx    ON public.ag_trip_requests (driver_id, status);
CREATE INDEX IF NOT EXISTS ag_trip_requests_passenger_status_idx ON public.ag_trip_requests (passenger_user_id, status);
-- patrón exacto de los cron de recordatorio de llegada / cancelación por abandono
CREATE INDEX IF NOT EXISTS ag_trip_requests_status_stage_idx ON public.ag_trip_requests (status, driver_stage);

-- 3. Reemplazar Haversine por ST_DWithin (mismo radio, mismo criterio) ------------

CREATE OR REPLACE FUNCTION public.ag_notify_drivers_on_trip_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
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

    -- Grupo 1: conductores con app abierta (is_online=true, gps reciente)
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.is_online = true
      AND d.status IN ('approved', 'quick')
      AND (d.vehicle_type = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '10 minutes'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)

    UNION

    -- Grupo 2: conductores con token FCM valido aunque la app este cerrada
    -- (is_online puede estar en false, se usa el ultimo gps conocido hasta 4h).
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id
      AND ps.provider = 'fcm'
      AND ps.fcm_token IS NOT NULL
    WHERE d.status IN ('approved', 'quick')
      AND (d.vehicle_type = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '4 hours'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)

  ) sub;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.ag_notify_drivers_trip_no_longer_available()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
  v_payload      jsonb;
  v_origin_geog  extensions.geography;
BEGIN
  IF OLD.status <> 'searching' OR NEW.status = 'searching' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN NEW; END IF;

  v_origin_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.origin_lng, NEW.origin_lat), 4326)::extensions.geography;

  SELECT ARRAY_AGG(DISTINCT uid) INTO v_user_ids FROM (

    -- Mismo grupo 1 que ag_notify_drivers_on_trip_request: conductores con app abierta
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.is_online = true
      AND d.status IN ('approved', 'quick')
      AND (CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '10 minutes'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)

    UNION

    -- Mismo grupo 2: conductores con token FCM aunque el app este cerrado
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id
      AND ps.provider = 'fcm'
      AND ps.fcm_token IS NOT NULL
    WHERE d.status IN ('approved', 'quick')
      AND (CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '4 hours'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)

  ) sub;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'user_ids',   v_user_ids,
    'cancel_tag', 'trip-' || NEW.id::text
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
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
END;
$$;
