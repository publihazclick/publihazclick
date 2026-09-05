-- Migración 269: la ubicación en vivo por WhatsApp llevaba semanas sin llegar (2026-09-05).
--
-- QUÉ PASÓ
-- Yolima Vera pidió un viaje por WhatsApp y esperó 15 minutos sin saber dónde venía su
-- conductor ni cuánto faltaba. Escribió "?" tres veces. Nunca le llegó una sola ubicación.
--
-- CAUSA
-- `ag_wa_broadcast_live_locations()` manda el cuerpo del POST como `::text` y
-- `net.http_post` espera `jsonb`, así que revienta con
-- "function net.http_post(url => text, body => text, headers => jsonb) does not exist".
-- Es EXACTAMENTE el bug que arregló la migración 203 (llamada literalmente
-- "fix_http_post_body_cast"): se reintrodujo después, al agregarle a la consulta los campos
-- trip_request_id / service_type / for_other.
--
-- POR QUÉ NADIE LO NOTÓ EN SEMANAS -- LA PARTE IMPORTANTE
-- El cron reporta **3.193 corridas exitosas y solo 11 fallidas**, o sea 99,7% de salud. Pero
-- el `PERFORM net.http_post(...)` está DENTRO del bucle: cuando no hay ningún viaje de
-- WhatsApp activo, el bucle no ejecuta su cuerpo y la corrida "tiene éxito" sin hacer nada.
-- Las 3.193 exitosas son corridas vacías. Las 11 fallas son **las únicas veces que hubo algo
-- que enviar** -- 3 el 2026-08-30 y 8 el 2026-09-05 -- y falló el 100% de las veces que
-- importaba.
--
-- Lección para otros crons: un cron que solo hace trabajo cuando hay datos no se puede
-- monitorear por su tasa de éxito. Hay que mirar las corridas que SÍ tuvieron trabajo.
--
-- El único cambio real es `::text` -> `::jsonb`. Todo lo demás queda idéntico a la definición
-- que está viva en producción (se comparó antes de tocar nada).

CREATE OR REPLACE FUNCTION public.ag_wa_broadcast_live_locations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tr.id, tr.wa_phone, dl.lat, dl.lng, tr.driver_stage, tr.service_type, tr.for_other
    FROM ag_trip_requests tr
    JOIN ag_driver_locations dl ON dl.driver_id = tr.driver_id
    WHERE tr.source = 'whatsapp'
      AND tr.status = 'accepted'
      AND tr.wa_phone IS NOT NULL
      AND tr.driver_id IS NOT NULL
      AND COALESCE(tr.driver_stage, 'heading_to_pickup') <> 'arrived_at_destination'
  LOOP
    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'live_location',
        'wa_phone',        r.wa_phone,
        'trip_request_id', r.id::text,
        'lat',             r.lat,
        'lng',             r.lng,
        'driver_stage',    r.driver_stage,
        'service_type',    r.service_type,
        'for_other',       r.for_other
      )::jsonb,   -- <-- era ::text y por eso no existía la firma de net.http_post
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END LOOP;
END;
$function$;
