-- =============================================================================
-- Migración 203: Corrige el cast de "body" en net.http_post() dentro de las
-- 3 funciones que avisan por WhatsApp (oferta recibida, viaje completado,
-- ubicación en vivo del conductor).
--
-- Bug real (2026-08-09): net.http_post() espera `body jsonb`, pero las tres
-- funciones casteaban el resultado de json_build_object(...) a `::text`.
-- Postgres rechaza la llamada por completo con un error de tipo ("function
-- net.http_post(url => text, body => text, headers => jsonb) does not
-- exist"), lo que hace fallar TODA la transacción que dispara el trigger --
-- en el caso de ag_wa_offer_trigger_fn (trigger AFTER INSERT en
-- ag_trip_offers) esto significa que NINGUNA oferta de un conductor sobre
-- un viaje pedido por WhatsApp se llegaba a guardar nunca: el INSERT entero
-- se revertía por el error del trigger. Confirmado en vivo probando el
-- insert directo.
-- =============================================================================

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
  v_driver_rating numeric;
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
    COALESCE(d.vehicle_brand || ' ' || d.vehicle_model, ''),
    COALESCE(d.plate, '')
  INTO v_driver_name, v_driver_phone, v_driver_vehicle, v_driver_plate
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
      'driver_rating',   COALESCE(v_driver_rating, 0),
      'offered_price',   NEW.offered_price
    )::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ag_wa_trip_completed_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.driver_stage = 'arrived_at_destination'
     AND (OLD.driver_stage IS NULL OR OLD.driver_stage <> 'arrived_at_destination')
     AND NEW.source = 'whatsapp'
     AND NEW.wa_phone IS NOT NULL
  THEN
    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'trip_completed',
        'wa_phone',        NEW.wa_phone,
        'trip_request_id', NEW.id::text,
        'amount',          COALESCE(NEW.offered_price, 0)
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ag_wa_broadcast_live_locations()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tr.wa_phone, dl.lat, dl.lng, tr.driver_stage
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
        'lat',             r.lat,
        'lng',             r.lng,
        'driver_stage',    r.driver_stage
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END LOOP;
END;
$function$;
