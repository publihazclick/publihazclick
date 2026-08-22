-- Pedido explícito del usuario 2026-08-22: no tiene dinero para recargar créditos de Verifik
-- (verificación automática de SOAT/tecnomecánica contra el RUNT), así que no quiere dejar a los
-- conductores con documentación completa esperando 24-48h de revisión manual sin poder trabajar.
-- Un conductor en status='pending' (formulario completo, documentos enviados, esperando revisión)
-- ahora puede recibir solicitudes y aceptar viajes exactamente igual que uno 'approved' -- el
-- front (anda-gana.component.ts) ya deja de bloquearlo, esto actualiza el emparejamiento del
-- lado de la base de datos para que también los vea/notifique.

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
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.is_online = true
      AND d.status IN ('approved', 'quick', 'pending')
      AND (d.vehicle_type = NEW.vehicle_type
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
      AND (d.vehicle_type = NEW.vehicle_type
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

CREATE OR REPLACE FUNCTION public.ag_find_nearest_drivers(p_trip_request_id uuid, p_lat double precision, p_lng double precision, p_vehicle_type text DEFAULT NULL::text, p_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_drivers jsonb := '[]'::jsonb;
  v_rec record;
BEGIN
  -- Buscar conductores online más cercanos usando distancia euclidiana
  -- (suficiente para distancias cortas urbanas)
  FOR v_rec IN
    SELECT
      dl.driver_id,
      d.ag_user_id,
      u.full_name,
      d.vehicle_type,
      d.vehicle_brand,
      d.vehicle_model,
      d.plate,
      dl.lat,
      dl.lng,
      -- Distancia aproximada en km (fórmula Haversine simplificada)
      ROUND(
        (111.045 * SQRT(
          POWER(dl.lat - p_lat, 2) +
          POWER((dl.lng - p_lng) * COS(RADIANS(p_lat)), 2)
        ))::numeric, 2
      ) AS distance_km
    FROM ag_driver_locations dl
    JOIN ag_drivers d ON d.id = dl.driver_id
    JOIN ag_users u ON u.id = d.ag_user_id
    WHERE d.status IN ('approved', 'pending')
      AND d.is_available = true
      AND (p_vehicle_type IS NULL OR d.vehicle_type = p_vehicle_type)
      -- Solo conductores que actualizaron ubicación en los últimos 5 minutos
      AND dl.updated_at > now() - interval '5 minutes'
    ORDER BY
      POWER(dl.lat - p_lat, 2) + POWER((dl.lng - p_lng) * COS(RADIANS(p_lat)), 2)
    LIMIT p_limit
  LOOP
    v_drivers := v_drivers || jsonb_build_object(
      'driver_id', v_rec.driver_id,
      'ag_user_id', v_rec.ag_user_id,
      'full_name', v_rec.full_name,
      'vehicle_type', v_rec.vehicle_type,
      'vehicle_brand', v_rec.vehicle_brand,
      'vehicle_model', v_rec.vehicle_model,
      'plate', v_rec.plate,
      'lat', v_rec.lat,
      'lng', v_rec.lng,
      'distance_km', v_rec.distance_km
    );
  END LOOP;

  RETURN jsonb_build_object(
    'drivers', v_drivers,
    'count', jsonb_array_length(v_drivers)
  );
END;
$function$;
