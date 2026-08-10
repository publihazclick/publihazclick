-- =============================================================================
-- Migración 205: Fase 1 de la humanización del canal WhatsApp de Movi.
--
-- 1. Guarda el nombre real del contacto de WhatsApp en la sesión para poder
--    saludar y hablarle por su nombre en toda la conversación, no solo en el
--    primer mensaje.
-- 2. Agrega la foto (selfie_url) del conductor al aviso de "oferta recibida"
--    -- antes solo mandaba nombre/placa/vehículo en texto plano.
-- =============================================================================

ALTER TABLE public.ag_wa_sessions ADD COLUMN IF NOT EXISTS contact_name text;

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
    COALESCE(d.plate, ''),
    u.selfie_url
  INTO v_driver_name, v_driver_phone, v_driver_vehicle, v_driver_plate, v_driver_photo
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
      'offered_price',   NEW.offered_price
    )::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$function$;
