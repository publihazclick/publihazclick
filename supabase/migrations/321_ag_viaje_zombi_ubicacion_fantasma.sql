-- 321 (2026-10-06): mensajes "📍 Tu conductor: Va en camino" a un pasajero SIN viaje.
--
-- Encontrado revisando las pruebas del dueño del 2026-10-05: a las 9:52 p. m. le llegó la ubicación
-- de un conductor cuando no tenía ningún viaje. Venía del viaje 3e0c5567 del 2026-09-14 (su número,
-- conductor Gabriel), que se quedó en status 'accepted' / driver_stage 'on_route' para siempre: el
-- cron movi-wa-live-location (cada 4 min) le mandaba la ubicación de Gabriel cada vez que este
-- estaba en línea. 44 mensajes entre el 2026-09-14 y el 2026-10-05, y de paso revelaba dónde
-- estaba Gabriel a alguien que ya no viajaba con él.
--
-- 1) Se cierra ese viaje. No mueve dinero: ag_handle_trip_cancellation solo reembolsa comisión si
--    el conductor no había recogido al pasajero (heading_to_pickup / arrived_at_pickup), y este
--    estaba 'on_route'.
-- 2) El cron solo manda ubicación de viajes creados en las últimas 12 horas. Ningún viaje urbano
--    dura eso; si otro viaje se queda trabado, deja de escribirle al pasajero.

UPDATE public.ag_trip_requests
SET status = 'cancelled',
    cancelled_at = now(),
    cancel_reason = 'Cerrado por soporte: viaje trabado en aceptado desde 2026-09-14 (mig 321)'
WHERE id = '3e0c5567-b9bc-4595-a68f-d4769f677072'
  AND status = 'accepted';

CREATE OR REPLACE FUNCTION public.ag_wa_broadcast_live_locations()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r     RECORD;
  v_url TEXT;
  v_key TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url'     LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT tr.id, tr.wa_phone, dl.lat, dl.lng, tr.driver_stage, tr.service_type, tr.for_other,
           tr.origin_lat, tr.origin_lng,
           EXTRACT(EPOCH FROM (now() - dl.updated_at))::int AS loc_age_sec
    FROM ag_trip_requests tr
    JOIN ag_driver_locations dl ON dl.driver_id = tr.driver_id
    WHERE tr.source = 'whatsapp'
      AND tr.status = 'accepted'
      AND tr.wa_phone IS NOT NULL
      AND tr.driver_id IS NOT NULL
      AND COALESCE(tr.driver_stage, 'heading_to_pickup') <> 'arrived_at_destination'
      AND dl.updated_at > now() - interval '10 minutes'
      -- mig 321: un viaje trabado no le escribe al pasajero por semanas.
      AND tr.created_at > now() - interval '12 hours'
  LOOP
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object(
        '_internal_event', 'live_location',
        'wa_phone',        r.wa_phone,
        'trip_request_id', r.id::text,
        'lat',             r.lat,
        'lng',             r.lng,
        'origin_lat',      r.origin_lat,
        'origin_lng',      r.origin_lng,
        'driver_stage',    r.driver_stage,
        'service_type',    r.service_type,
        'for_other',       r.for_other,
        'loc_age_sec',     r.loc_age_sec
      )::jsonb,
      timeout_milliseconds := 8000
    );
  END LOOP;
END;
$function$;
