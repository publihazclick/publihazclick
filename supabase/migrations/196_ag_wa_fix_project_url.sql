-- ════════════════════════════════════════════════════════════
-- 196: Corregir URL del proyecto en los triggers de WhatsApp (Movi)
-- ════════════════════════════════════════════════════════════
-- Las migraciones 176/177 dejaron los triggers de aviso por WhatsApp
-- (oferta recibida / viaje completado) apuntando a la URL del proyecto
-- COMPARTIDO viejo (btkdmdhzouzvzgyuzgbh), que fue donde se separó Movi
-- en julio 2026. Esa función ag-whatsapp ya no existe ahí (fue borrada
-- durante la separación) — el aviso al pasajero nunca llegaba.
-- Corrección: apuntar al proyecto dedicado de Movi (hndhgtnjyjwrnzdcgcca).

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
    )::text,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ag_wa_trip_completed_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
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
      )::text,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;
