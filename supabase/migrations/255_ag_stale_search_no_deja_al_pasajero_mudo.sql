-- 255: el pasajero se quedaba en silencio para siempre esperando conductor
--
-- Reportado por el usuario 2026-09-02: "han pasado 17 minutos desde que en el whatsapp del
-- pasajero se quedo el mensaje buscando conductores".
--
-- El cron ag_wa_stale_search_check NO estaba caido: aviso puntual a los 4, 8 y 12 minutos. El
-- problema es que se detiene ahi (wa_stale_check_round < 3) y el conteo iba contra created_at,
-- que obviamente no cambia. Cuando el pasajero apretaba "Seguir buscando",
-- ag_rebroadcast_trip_request reabria la solicitud para los conductores pero NO reiniciaba ese
-- contador -- asi que recibia "te avisamos apenas alguien acepte" y despues silencio absoluto,
-- sin ningun boton, sin forma de saber si seguia pasando algo. Caso real medido: solicitud
-- creada 22:39, avisos 22:44 / 22:48 / 22:52, "Seguir buscando" a las 22:57 y nada mas durante
-- 18 minutos.
--
-- Dos cambios:
--   1. El aviso se cuenta desde el ULTIMO aviso enviado (wa_stale_check_sent_at), no desde la
--      creacion. Asi el ciclo no depende de la edad absoluta de la solicitud.
--   2. "Seguir buscando" reinicia el contador, de modo que cada vez que el pasajero pide seguir
--      esperando vuelve a tener sus 3 avisos con botones. Ya no se queda nunca sin opciones.
--
-- PENDIENTE, decision del usuario: una solicitud en 'searching' que nadie toma no expira NUNCA.
-- ag_cancel_abandoned_trips solo cancela viajes ya 'accepted' cuyo conductor se quedo mudo. Hay
-- solicitudes de mas de 20 horas todavia abiertas. Habria que cerrarlas avisandole al pasajero,
-- pero eso cambia lo que ve el usuario final y no se toca sin su visto bueno.

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
      AND COALESCE(tr.wa_stale_check_sent_at, tr.created_at) <= now() - interval '4 minutes'
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
$function$
;

CREATE OR REPLACE FUNCTION public.ag_rebroadcast_trip_request(p_trip_id uuid)
 RETURNS integer
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
  -- wa_stale_check_round = 0: sin esto, apretar "Seguir buscando" reabria la solicitud para
  -- los conductores pero NO reiniciaba el ciclo de avisos al pasajero, que estaba topado en 3
  -- rondas contadas desde la creacion. Resultado real (2026-09-02): el pasajero apretaba
  -- "Seguir buscando", recibia "te avisamos apenas alguien acepte" y se quedaba en silencio
  -- para siempre. Ahora cada vez que pide seguir buscando vuelve a tener sus avisos.
  UPDATE public.ag_trip_requests
  SET driver_visible_since = now(),
      wa_stale_check_round = 0,
      wa_stale_check_sent_at = now()
  WHERE id = p_trip_id;

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
$function$
;
