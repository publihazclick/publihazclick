-- Migration 152: Corregir matching de vehicle_type en notificaciones push
-- ag_drivers.vehicle_type puede ser 'sedan','suv','van', etc.
-- ag_trip_requests.vehicle_type solo puede ser 'carro' o 'moto'
-- → normalizar: cualquier tipo que no sea 'moto' se trata como 'carro'

CREATE OR REPLACE FUNCTION public.ag_notify_drivers_on_trip_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
  v_price_fmt    TEXT;
  v_payload      jsonb;
BEGIN
  IF NEW.status <> 'searching' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN NEW; END IF;

  v_price_fmt := '$' || to_char(NEW.offered_price, 'FM999G999G999') || ' COP';

  -- Normalizar vehicle_type del conductor: 'moto' → 'moto', cualquier otro → 'carro'
  SELECT ARRAY_AGG(u.auth_user_id::text)
  INTO v_user_ids
  FROM public.ag_drivers d
  JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
  JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE d.is_online = true
    AND d.status IN ('approved', 'quick')
    AND (CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
    AND d.notify_new_requests = true
    AND dl.updated_at > NOW() - INTERVAL '10 minutes'
    AND (
      6371 * acos(
        LEAST(1.0,
          cos(radians(NEW.origin_lat)) * cos(radians(dl.lat))
          * cos(radians(dl.lng) - radians(NEW.origin_lng))
          + sin(radians(NEW.origin_lat)) * sin(radians(dl.lat))
        )
      )
    ) <= 20;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'user_ids', v_user_ids,
    'title',    '🚗 Nueva solicitud de viaje',
    'body',     v_price_fmt || ' · ' || round(NEW.distance_km::numeric, 1) || ' km — toca para ver',
    'url',      '/anda-gana',
    'tag',      'trip-' || NEW.id::text,
    'urgent',   true
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
$$;
