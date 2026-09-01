-- Migration 244: re-corregir matching de vehicle_type en notificaciones push
--
-- Contexto (2026-09-01): ag_drivers.vehicle_type puede ser 'carro','moto','suv','van',
-- 'camion','sedan','hatchback' (el formulario "Agregar vehículo" ofrece SUV/Van/Camión
-- como opciones reales), pero ag_trip_requests.vehicle_type SOLO puede ser 'carro' o
-- 'moto' (CHECK constraint de la tabla, confirmado en la migración 229). El match exacto
-- `d.vehicle_type = NEW.vehicle_type` que trae esta función desde la migración 217 nunca
-- es true para un conductor con SUV/Van/Camión/Sedán/Hatchback -- esos conductores dejaban
-- de recibir CUALQUIER push de solicitud tipo carro (con la app cerrada o en segundo
-- plano), aunque sí las veían dentro de la app porque _loadDriverRequests() en el
-- frontend sí normaliza correctamente.
--
-- Esto ya se había corregido una vez en la migración 152 ("fix_push_vehicle_match":
-- normalizar cualquier tipo que no sea 'moto' a 'carro'), pero la reescritura de la
-- migración 217 (PostGIS matching) revirtió el fix sin darse cuenta al reemplazar toda
-- la función. Esta migración reaplica la misma normalización de 152, ahora sobre los 2
-- grupos (app abierta / FCM app cerrada) que agregó 217, y deja todo lo demás igual
-- (geo PostGIS, estados 'pending', ventanas de 10min/4h).
--
-- Verificado contra la función viva en el proyecto Movi (hndhgtnjyjwrnzdcgcca) antes de
-- escribir este fix -- el proyecto compartido btkdmdhzouzvzgyuzgbh ya NO tiene código de
-- Movi (separado 2026-07-05, ver memoria movi_supabase_separacion).

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
    -- Normalizacion: cualquier vehicle_type que no sea 'moto' cuenta como 'carro' --
    -- ag_trip_requests.vehicle_type solo admite esos 2 valores, ag_drivers.vehicle_type
    -- puede ser mas especifico (suv/van/camion/sedan/hatchback).
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
    WHERE d.status IN ('approved', 'quick', 'pending')
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
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
