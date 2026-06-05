-- ════════════════════════════════════════════════════════════
-- 177: Corregir triggers WA — hacer JOIN con ag_drivers/ag_users
-- ════════════════════════════════════════════════════════════

-- Corregir trigger de oferta: hacer JOIN para obtener datos del conductor
CREATE OR REPLACE FUNCTION ag_wa_offer_trigger_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_source        text;
  v_wa_phone      text;
  v_driver_name   text;
  v_driver_phone  text;
  v_driver_vehicle text;
  v_driver_plate  text;
  v_driver_rating numeric;
BEGIN
  -- Solo procesar ofertas nuevas en estado pending
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  -- Verificar que el viaje sea de WhatsApp
  SELECT source, wa_phone
    INTO v_source, v_wa_phone
    FROM ag_trip_requests
    WHERE id = NEW.trip_request_id;

  IF v_source IS DISTINCT FROM 'whatsapp' OR v_wa_phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener datos del conductor via JOIN
  SELECT
    u.full_name,
    u.phone,
    COALESCE(d.vehicle_brand || ' ' || d.vehicle_model, ''),
    COALESCE(d.plate, '')
  INTO v_driver_name, v_driver_phone, v_driver_vehicle, v_driver_plate
  FROM ag_drivers d
  JOIN ag_users u ON u.id = d.ag_user_id
  WHERE d.id = NEW.driver_id;

  -- Rating promedio del conductor
  SELECT COALESCE(ROUND(AVG(stars)::numeric, 1), 0)
    INTO v_driver_rating
    FROM ag_trip_ratings r
    JOIN ag_users u2 ON u2.id = r.rated_user_id
    JOIN ag_drivers d2 ON d2.ag_user_id = u2.id
    WHERE d2.id = NEW.driver_id AND r.rated_by_role = 'passenger';

  -- Llamar al edge function vía pg_net
  PERFORM net.http_post(
    url     := 'https://btkdmdhzouzvzgyuzgbh.supabase.co/functions/v1/ag-whatsapp'::text,
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
    )::text,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;

-- Re-crear el trigger (ya existe como INSERT, solo actualiza la función)
DROP TRIGGER IF EXISTS ag_wa_offer_trigger ON ag_trip_offers;
CREATE TRIGGER ag_wa_offer_trigger
  AFTER INSERT ON ag_trip_offers
  FOR EACH ROW EXECUTE FUNCTION ag_wa_offer_trigger_fn();

-- Simplificar ag_wa_accept_offer: solo actualizar la oferta a 'accepted'
-- El trigger existente trg_offer_accepted se encarga del resto
CREATE OR REPLACE FUNCTION ag_wa_accept_offer(
  p_offer_id        uuid,
  p_trip_request_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Verificar que la oferta pertenece a ese viaje y está pendiente
  IF NOT EXISTS (
    SELECT 1 FROM ag_trip_offers
    WHERE id = p_offer_id
      AND trip_request_id = p_trip_request_id
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Oferta no disponible';
  END IF;

  -- Marcar como aceptada; el trigger trg_offer_accepted cancela las demás
  UPDATE ag_trip_offers
    SET status = 'accepted', updated_at = now()
    WHERE id = p_offer_id;
END;
$$;
