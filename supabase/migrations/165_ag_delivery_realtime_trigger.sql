-- Migration 165: Trigger push + publication realtime para ag_delivery_requests
-- Idéntico al flujo de ag_trip_requests: push inmediata a motos cercanas al crear un domicilio.

-- ── Publicación realtime ─────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE ag_delivery_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE ag_delivery_offers;

-- ── Trigger push para motos cercanas ────────────────────────────────────────
CREATE OR REPLACE FUNCTION ag_notify_motos_on_delivery_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_url     TEXT;
  v_key     TEXT;
  v_ids     TEXT[];
  v_payload jsonb;
BEGIN
  IF NEW.status <> 'searching' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'    LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN NEW; END IF;

  -- Motos online en los últimos 10 min dentro de 15 km del pickup
  SELECT ARRAY_AGG(DISTINCT u.auth_user_id::text) INTO v_ids
  FROM   public.ag_drivers d
  JOIN   public.ag_driver_locations dl ON dl.driver_id = d.id
  JOIN   public.ag_users u             ON u.id = d.ag_user_id
  WHERE  d.vehicle_type = 'moto'
    AND  d.is_online    = true
    AND  d.status IN ('approved', 'quick')
    AND  dl.updated_at > NOW() - INTERVAL '10 minutes'
    AND  (6371 * acos(LEAST(1.0,
            cos(radians(NEW.pickup_lat)) * cos(radians(dl.lat))
            * cos(radians(dl.lng) - radians(NEW.pickup_lng))
            + sin(radians(NEW.pickup_lat)) * sin(radians(dl.lat))
          ))) <= 15;

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'user_ids', v_ids,
    'title',    '🛵 ¡Nuevo domicilio cerca!',
    'body',     '$' || to_char(NEW.offered_price, 'FM999G999') || ' COP — ' || COALESCE(NEW.package_description, 'Paquete'),
    'url',      '/anda-gana',
    'tag',      'delivery-' || NEW.id::text,
    'urgent',   true
  );

  BEGIN
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/ag-send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := v_payload,
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ag_delivery_request_notify ON ag_delivery_requests;
CREATE TRIGGER ag_delivery_request_notify
  AFTER INSERT ON ag_delivery_requests
  FOR EACH ROW EXECUTE FUNCTION ag_notify_motos_on_delivery_request();
