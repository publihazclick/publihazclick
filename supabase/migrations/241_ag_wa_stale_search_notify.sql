-- Aviso proactivo "seguimos buscando" cuando nadie ha aceptado el viaje pedido por WhatsApp.
-- Antes el timeout de "nadie aceptó" solo se evaluaba de forma reactiva (cuando el pasajero
-- volvía a escribir algo), así que si se quedaba callado esperando, el mensaje "Buscando
-- conductores cerca de ti..." se quedaba ahí sin ningún seguimiento, aunque la solicitud ya
-- llevaba rato invisible para los conductores (getSearchingRequests solo trae solicitudes de
-- los últimos 4 minutos -- mismo límite que ya usa la tarjeta del conductor en la app). Este
-- cron corre cada minuto y, apenas se cumplen 4/8/12 minutos sin aceptación, dispara un evento
-- interno hacia ag-whatsapp para que le mande al pasajero un aviso real con botones.

ALTER TABLE public.ag_trip_requests
  ADD COLUMN IF NOT EXISTS wa_stale_check_round INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wa_stale_check_sent_at TIMESTAMPTZ;

-- Repite exactamente la misma lógica de geofencing + push que ag_notify_drivers_on_trip_request()
-- (2 grupos: online con GPS reciente, y con token FCM aunque la app esté cerrada, radio 20km),
-- pero invocable a demanda en vez de solo por el trigger de INSERT -- para "reenviar" la
-- solicitud cuando el pasajero toca "Seguir buscando" o "Subir oferta" y que de verdad vuelvan
-- a sonar los celulares de los conductores cercanos.
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

-- Cron cada minuto (mismo intervalo que movi-wa-arrival-reminder): revisa viajes por WhatsApp
-- en estado 'searching' que ya cruzaron el umbral de 4 minutos de la ronda actual (0->1, 1->2,
-- 2->3) y dispara el evento interno hacia ag-whatsapp. Máximo 3 rondas (12 min totales) --
-- después de eso el propio bot cancela el viaje al recibir la ronda 3 sin aceptación.
CREATE OR REPLACE FUNCTION public.ag_wa_stale_search_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tr.id, tr.wa_phone, tr.for_other, tr.service_type, tr.wa_stale_check_round
    FROM public.ag_trip_requests tr
    WHERE tr.source = 'whatsapp'
      AND tr.status = 'searching'
      AND tr.wa_phone IS NOT NULL
      AND tr.wa_stale_check_round < 3
      AND tr.created_at <= now() - ((tr.wa_stale_check_round + 1) * interval '4 minutes')
  LOOP
    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event',   'stale_search_check',
        'wa_phone',          r.wa_phone,
        'trip_request_id',   r.id::text,
        'for_other',         r.for_other,
        'service_type',      r.service_type,
        'round',             r.wa_stale_check_round + 1
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );

    UPDATE public.ag_trip_requests
    SET wa_stale_check_round = wa_stale_check_round + 1,
        wa_stale_check_sent_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$function$;

SELECT cron.schedule('movi-wa-stale-search-check', '* * * * *', $$SELECT public.ag_wa_stale_search_check();$$);
