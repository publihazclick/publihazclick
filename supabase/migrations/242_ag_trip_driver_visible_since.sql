-- Bug real reportado por el usuario 2026-08-30: cuando el pasajero pide viaje por WhatsApp y
-- toca "Seguir buscando" (migración 241), a los conductores cercanos les llega la notificación
-- push de verdad (eso ya funcionaba), pero al tocarla la solicitud NO aparecía en la app.
--
-- Causa raíz: TODO el lado del conductor (la consulta getSearchingRequests, el merge del refresh
-- cada 20s, y el timer de 1s que expira tarjetas en anda-gana.component.ts) decide si una
-- solicitud sigue siendo "válida para mostrar" comparando `created_at` contra los últimos 4
-- minutos. ag_rebroadcast_trip_request() nunca tocaba created_at (con razón: created_at debe
-- seguir siendo el momento real en que el pasajero pidió el viaje, para historial/analítica), así
-- que un viaje re-anunciado a los 8-12 minutos llegaba con push real, pero el timer de 1 segundo
-- lo sacaba de la lista casi de inmediato por "viejo" (created_at ya pasaba los 240000ms).
--
-- Solución: separar los dos conceptos. `created_at` sigue siendo inmutable (historial real, y lo
-- que usa el cron de avisos al pasajero para las rondas de 4/8/12 min). `driver_visible_since` es
-- un reloj aparte que arranca igual a created_at para cualquier solicitud nueva, pero se reinicia
-- a `now()` cada vez que se reenvía la solicitud (Seguir buscando / Subir oferta) -- para que la
-- ventana de 4 minutos de visibilidad del conductor se reinicie de verdad junto con el push real.

ALTER TABLE public.ag_trip_requests
  ADD COLUMN IF NOT EXISTS driver_visible_since TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: para filas existentes, igual a created_at (mismo comportamiento de siempre).
UPDATE public.ag_trip_requests SET driver_visible_since = created_at WHERE driver_visible_since IS DISTINCT FROM created_at AND status = 'searching';

CREATE OR REPLACE FUNCTION public.ag_rebroadcast_trip_request(p_trip_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
  v_price_fmt    TEXT;
  v_origin_geog  extensions.geography;
  v_req          RECORD;
BEGIN
  SELECT * INTO v_req FROM public.ag_trip_requests WHERE id = p_trip_id AND status = 'searching';
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Reinicia la ventana de visibilidad del conductor -- sin esto, el push llega pero la app
  -- descarta la solicitud de inmediato por considerarla "vieja" (ver comentario arriba).
  UPDATE public.ag_trip_requests SET driver_visible_since = now() WHERE id = p_trip_id;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN 0; END IF;

  v_price_fmt := '$' || to_char(v_req.offered_price, 'FM999G999G999');
  v_origin_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(v_req.origin_lng, v_req.origin_lat), 4326)::extensions.geography;

  SELECT ARRAY_AGG(DISTINCT uid) INTO v_user_ids FROM (
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.is_online = true
      AND d.status IN ('approved', 'quick', 'pending')
      AND (d.vehicle_type = v_req.vehicle_type OR v_req.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '10 minutes'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)
    UNION
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id AND ps.provider = 'fcm' AND ps.fcm_token IS NOT NULL
    WHERE d.status IN ('approved', 'quick', 'pending')
      AND (d.vehicle_type = v_req.vehicle_type OR v_req.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '4 hours'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)
  ) sub;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN RETURN 0; END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/ag-send-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body    := jsonb_build_object(
        'user_ids', v_user_ids,
        'title',    'Nueva solicitud · ' || v_price_fmt,
        'body',     COALESCE(v_req.origin_name, 'Origen sin nombre') || ' → ' || v_req.dest_name
                    || E'\n' || v_price_fmt || ' · ' || round(v_req.distance_km::numeric, 1) || ' km',
        'url',      '/anda-gana?trip_request_id=' || v_req.id::text,
        'tag',      'trip-' || v_req.id::text,
        'urgent',   true,
        'trip_id',  v_req.id::text,
        'price',    v_req.offered_price::text,
        'dist',     round(v_req.distance_km::numeric, 1)::text,
        'origin',   COALESCE(v_req.origin_name, 'Origen sin nombre'),
        'dest',     v_req.dest_name
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN array_length(v_user_ids, 1);
END;
$function$;
