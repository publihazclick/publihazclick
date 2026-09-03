-- ============================================================================
-- 262 — El reparto no tiene tope de distancia
-- ============================================================================
--
-- Regla del negocio, reafirmada por el usuario el 2026-09-03:
--   "quiero que le llegue a TODOS los conductores CADA solicitud sin importar
--    que tan lejos esten del origen"
--
-- Las ramas 1 y 2 de ag_notify_drivers_on_trip_request tenian un
-- ST_DWithin(dl.geog, v_origin_geog, 30000): un conductor con ubicacion
-- reciente a mas de 30 km del origen quedaba fuera del reparto. Se elimina.
--
-- Efecto medido al aplicarlo: NINGUNO hoy -- no habia un solo conductor a mas
-- de 30 km (todos operan en Cucuta). El cambio importa hacia adelante, cuando
-- haya conductores en otras ciudades.
--
-- Contrapartida asumida a proposito: un conductor de otra ciudad va a recibir
-- solicitudes que no puede tomar. Es el precio de la regla y esta aceptado --
-- es mucho peor que una solicitud no la vea nadie a que la vea alguien lejos,
-- que simplemente no oferta. Para que pueda descartarla de un vistazo, la app
-- ahora le muestra a cuantos km esta del punto de recogida y le ordena las mas
-- cercanas primero (commit 8cbb6ea, pickupDistanceKm/_sortDriverRequests).
--
-- Se conservan intactas las 3 ramas, el registro en ag_trip_push_log y el
-- net.http_post a ag-send-push: esta funcion se tomo de la definicion REAL de
-- produccion y se le quitaron unicamente las 2 lineas del ST_DWithin, sin
-- reescribirla (leccion de [[movi_viaje_perdido_por_cierre_con_oferta_viva]]).
-- ============================================================================

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
      -- Tope de 30 km eliminado (2026-09-03, pedido explicito del usuario): la regla es que
      -- TODO conductor registrado reciba TODA solicitud sin importar a que distancia este. El
      -- conductor decide si le sirve; para eso ahora la app le muestra a cuantos km esta del
      -- punto de recogida (ver pickupDistanceKm en anda-gana.component.ts).

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
      -- Tope de 30 km eliminado (2026-09-03, pedido explicito del usuario): la regla es que
      -- TODO conductor registrado reciba TODA solicitud sin importar a que distancia este. El
      -- conductor decide si le sirve; para eso ahora la app le muestra a cuantos km esta del
      -- punto de recogida (ver pickupDistanceKm en anda-gana.component.ts).

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

