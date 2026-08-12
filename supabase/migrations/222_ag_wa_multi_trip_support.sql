-- Migración 217: soporte para pedir un vehículo nuevo por WhatsApp mientras
-- otro viaje ya va en curso (pedido explícito del usuario 2026-08-12: "que
-- pueda pedir otro vehículo apenas la otra persona esté a bordo").
--
-- Contexto: ag_wa_sessions es UNA sola fila por número de WhatsApp (una sola
-- conversación activa a la vez, eso NO cambia -- no tiene sentido tener dos
-- chats paralelos en el mismo hilo). Lo que sí cambia es que un viaje que ya
-- va en curso (driver_stage = 'on_route' o más adelante) deja de depender de
-- esa sesión compartida para sus avisos automáticos -- hoy varios triggers
-- mandan el evento a ag-whatsapp SIN los datos propios del viaje
-- (service_type, para quién es), y el edge function los completaba leyendo
-- la sesión -- correcto mientras solo hay un viaje por teléfono, pero
-- incorrecto en cuanto la conversación activa pasa a ser la de un SEGUNDO
-- viaje distinto (el aviso del primero mostraría los datos del segundo).
-- Se agrega 'service_type' y 'for_other' (jsonb, ya existente en
-- ag_trip_requests desde la migración 116/215) a cada payload para que el
-- edge function pueda armar el texto correcto sin tocar la sesión.

-- 1. Cola de calificaciones pendientes -- cuando un viaje se completa
--    mientras la conversación activa está ocupada con OTRO viaje, no se le
--    puede pedir la calificación de inmediato (se perdería la respuesta a
--    lo que sea que esté haciendo en ese momento). Se guarda aquí y se
--    entrega apenas la conversación vuelva a quedar libre.
CREATE TABLE IF NOT EXISTS public.ag_wa_pending_ratings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone        text NOT NULL,
  trip_request_id uuid NOT NULL REFERENCES public.ag_trip_requests(id) ON DELETE CASCADE,
  driver_name     text,
  amount          integer NOT NULL DEFAULT 0,
  tip_amount      integer NOT NULL DEFAULT 0,
  distance_km     numeric NOT NULL DEFAULT 0,
  is_delivery     boolean NOT NULL DEFAULT false,
  for_name        text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ag_wa_pending_ratings_phone_idx
  ON public.ag_wa_pending_ratings (wa_phone, created_at);

ALTER TABLE public.ag_wa_pending_ratings ENABLE ROW LEVEL SECURITY;

-- 2. offer_received (migración 214) -- agrega service_type/for_other.
CREATE OR REPLACE FUNCTION public.ag_wa_offer_trigger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_source         text;
  v_wa_phone       text;
  v_service_type   text;
  v_for_other      jsonb;
  v_driver_name    text;
  v_driver_phone   text;
  v_driver_vehicle text;
  v_driver_plate   text;
  v_driver_photo   text;
  v_driver_rating  numeric;
  v_driver_trips   int;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  SELECT source, wa_phone, service_type, for_other
    INTO v_source, v_wa_phone, v_service_type, v_for_other
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
      'service_type',    v_service_type,
      'for_other',       v_for_other,
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

-- 3. driver_arrived (migración 206) -- agrega service_type/for_other y
--    vehículo/placa (antes solo viajaban cacheados en la sesión desde que se
--    aceptó la oferta).
CREATE OR REPLACE FUNCTION public.ag_wa_driver_arrived_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_driver_name    text;
  v_driver_vehicle text;
  v_driver_plate   text;
BEGIN
  IF NEW.driver_stage = 'arrived_at_pickup'
     AND (OLD.driver_stage IS NULL OR OLD.driver_stage <> 'arrived_at_pickup')
     AND NEW.source = 'whatsapp'
     AND NEW.wa_phone IS NOT NULL
  THEN
    SELECT u.full_name,
           COALESCE(NULLIF(TRIM(CONCAT_WS(' ', d.vehicle_brand, d.vehicle_model, d.vehicle_color)), ''), ''),
           COALESCE(d.plate, '')
      INTO v_driver_name, v_driver_vehicle, v_driver_plate
      FROM ag_drivers d JOIN ag_users u ON u.id = d.ag_user_id
      WHERE d.id = NEW.driver_id;

    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'driver_arrived',
        'wa_phone',        NEW.wa_phone,
        'trip_request_id', NEW.id::text,
        'service_type',    NEW.service_type,
        'for_other',       NEW.for_other,
        'driver_name',     COALESCE(v_driver_name, 'Tu conductor'),
        'driver_vehicle',  COALESCE(v_driver_vehicle, ''),
        'driver_plate',    COALESCE(v_driver_plate, ''),
        'origin_lat',      NEW.origin_lat,
        'origin_lng',      NEW.origin_lng
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. trip_completed (migración 210) -- agrega service_type/for_other.
CREATE OR REPLACE FUNCTION public.ag_wa_trip_completed_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_driver_name text;
BEGIN
  IF NEW.status = 'completed'
     AND (OLD.status IS NULL OR OLD.status <> 'completed')
     AND NEW.source = 'whatsapp'
     AND NEW.wa_phone IS NOT NULL
  THEN
    SELECT u.full_name INTO v_driver_name
    FROM ag_drivers d JOIN ag_users u ON u.id = d.ag_user_id
    WHERE d.id = NEW.driver_id;

    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event',  'trip_completed',
        'wa_phone',         NEW.wa_phone,
        'trip_request_id',  NEW.id::text,
        'service_type',     NEW.service_type,
        'for_other',        NEW.for_other,
        'driver_name',      COALESCE(v_driver_name, 'tu conductor'),
        'amount',           COALESCE(NEW.offered_price, 0),
        'base_fare',        COALESCE(NEW.base_fare, 0),
        'distance_fare',    COALESCE(NEW.distance_fare, 0),
        'tip_amount',       COALESCE(NEW.tip_amount, 0),
        'distance_km',      COALESCE(NEW.distance_km, 0)
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 5. trip_started (migración 211) -- agrega service_type/for_other.
CREATE OR REPLACE FUNCTION public.ag_wa_trip_started_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_driver_name text;
BEGIN
  IF NEW.driver_stage = 'on_route'
     AND (OLD.driver_stage IS NULL OR OLD.driver_stage <> 'on_route')
     AND NEW.source = 'whatsapp'
     AND NEW.wa_phone IS NOT NULL
  THEN
    SELECT u.full_name INTO v_driver_name
    FROM ag_drivers d JOIN ag_users u ON u.id = d.ag_user_id
    WHERE d.id = NEW.driver_id;

    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'trip_started',
        'wa_phone',        NEW.wa_phone,
        'trip_request_id', NEW.id::text,
        'service_type',    NEW.service_type,
        'for_other',       NEW.for_other,
        'driver_name',     COALESCE(v_driver_name, 'Tu conductor')
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 6. arrival_reminder (migración 216) -- agrega for_other (el cron ya lee de
--    ag_trip_requests, solo faltaba incluirlo en el payload).
CREATE OR REPLACE FUNCTION public.ag_wa_arrival_reminder()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_driver_name text;
BEGIN
  FOR r IN
    SELECT tr.id, tr.wa_phone, tr.driver_id, tr.for_other
    FROM ag_trip_requests tr
    WHERE tr.source = 'whatsapp'
      AND tr.status = 'accepted'
      AND tr.driver_stage = 'arrived_at_pickup'
      AND COALESCE(tr.service_type, 'carro') NOT IN ('domicilio', 'flete')
      AND tr.wa_phone IS NOT NULL
      AND tr.wa_arrival_reminder_sent = false
      AND tr.updated_at <= now() - interval '2 minutes'
      AND tr.updated_at >  now() - interval '4 minutes'
  LOOP
    SELECT u.full_name INTO v_driver_name
    FROM ag_drivers d JOIN ag_users u ON u.id = d.ag_user_id
    WHERE d.id = r.driver_id;

    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'arrival_reminder',
        'wa_phone',        r.wa_phone,
        'trip_request_id', r.id::text,
        'for_other',       r.for_other,
        'driver_name',     COALESCE(v_driver_name, 'Tu conductor')
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );

    UPDATE ag_trip_requests SET wa_arrival_reminder_sent = true WHERE id = r.id;
  END LOOP;
END;
$$;

-- 7. live_location (migración 198) -- agrega trip_request_id/service_type/for_other.
CREATE OR REPLACE FUNCTION public.ag_wa_broadcast_live_locations()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tr.id, tr.wa_phone, dl.lat, dl.lng, tr.driver_stage, tr.service_type, tr.for_other
    FROM ag_trip_requests tr
    JOIN ag_driver_locations dl ON dl.driver_id = tr.driver_id
    WHERE tr.source = 'whatsapp'
      AND tr.status = 'accepted'
      AND tr.wa_phone IS NOT NULL
      AND tr.driver_id IS NOT NULL
      AND COALESCE(tr.driver_stage, 'heading_to_pickup') <> 'arrived_at_destination'
  LOOP
    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'live_location',
        'wa_phone',        r.wa_phone,
        'trip_request_id', r.id::text,
        'lat',             r.lat,
        'lng',             r.lng,
        'driver_stage',    r.driver_stage,
        'service_type',    r.service_type,
        'for_other',       r.for_other
      )::text,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END LOOP;
END;
$$;
