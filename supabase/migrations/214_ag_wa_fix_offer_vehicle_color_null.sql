-- Migración 214: el mensaje "{conductor} quiere llevarte" por WhatsApp (evento
-- offer_received, disparado por este trigger cuando el conductor hace la oferta
-- desde la app nativa -- el camino real más común, no el de recuperación
-- oportunista de fetchNextPendingOffer en ag-whatsapp/index.ts, que ya estaba
-- bien) casi nunca mostraba marca ni color del vehículo.
--
-- Bug real reportado 2026-08-11 (segunda vez, "ya te lo pedí"): dos problemas
-- en la misma línea.
--   1. `d.vehicle_brand || ' ' || d.vehicle_model` -- concatenación con `||`
--      en Postgres devuelve NULL si CUALQUIERA de los operandos es NULL. La
--      mayoría de los conductores (incluido el conductor de prueba, marca
--      "fortuner" pero modelo vacío) tienen vehicle_model NULL -- el resultado
--      completo quedaba NULL, y COALESCE(NULL, '') lo volvía cadena vacía: el
--      pasajero nunca veía NADA del vehículo, ni siquiera la marca que sí
--      estaba guardada.
--   2. vehicle_color nunca se incluía en la concatenación -- a diferencia del
--      resto del código (fetchNextPendingOffer en ag-whatsapp/index.ts, que sí
--      usa marca+modelo+color desde el principio), este trigger solo pedía
--      marca+modelo.
--
-- Se reemplaza por CONCAT_WS, que ignora automáticamente los campos NULL en
-- vez de contaminar todo el resultado (mismo comportamiento que
-- `.filter(Boolean).join(' ')` ya usado en el lado TypeScript) y se agrega
-- vehicle_color a la selección.
CREATE OR REPLACE FUNCTION public.ag_wa_offer_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_source        text;
  v_wa_phone      text;
  v_driver_name   text;
  v_driver_phone  text;
  v_driver_vehicle text;
  v_driver_plate  text;
  v_driver_photo  text;
  v_driver_rating numeric;
  v_driver_trips  int;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  SELECT source, wa_phone
    INTO v_source, v_wa_phone
    FROM ag_trip_requests
    WHERE id = NEW.trip_request_id;

  IF v_source IS DISTINCT FROM 'whatsapp' OR v_wa_phone IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    u.full_name,
    u.phone,
    COALESCE(NULLIF(TRIM(CONCAT_WS(' ', d.vehicle_brand, d.vehicle_model, d.vehicle_color)), ''), ''),
    COALESCE(d.plate, ''),
    u.selfie_url,
    COALESCE(d.metric_trips_completed, 0)
  INTO v_driver_name, v_driver_phone, v_driver_vehicle, v_driver_plate, v_driver_photo, v_driver_trips
  FROM ag_drivers d
  JOIN ag_users u ON u.id = d.ag_user_id
  WHERE d.id = NEW.driver_id;

  SELECT COALESCE(ROUND(AVG(stars)::numeric, 1), 0)
    INTO v_driver_rating
    FROM ag_trip_ratings r
    JOIN ag_users u2 ON u2.id = r.rated_user_id
    JOIN ag_drivers d2 ON d2.ag_user_id = u2.id
    WHERE d2.id = NEW.driver_id AND r.rated_by_role = 'passenger';

  PERFORM net.http_post(
    url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
    body    := json_build_object(
      '_internal_event', 'offer_received',
      'wa_phone',        v_wa_phone,
      'offer_id',        NEW.id::text,
      'trip_request_id', NEW.trip_request_id::text,
      'driver_name',     COALESCE(v_driver_name, 'Conductor'),
      'driver_phone',    COALESCE(v_driver_phone, ''),
      'driver_vehicle',  COALESCE(v_driver_vehicle, ''),
      'driver_plate',    COALESCE(v_driver_plate, ''),
      'driver_photo',    COALESCE(v_driver_photo, ''),
      'driver_rating',   COALESCE(v_driver_rating, 0),
      'driver_trips',    COALESCE(v_driver_trips, 0),
      'offered_price',   NEW.offered_price
    )::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$function$;
