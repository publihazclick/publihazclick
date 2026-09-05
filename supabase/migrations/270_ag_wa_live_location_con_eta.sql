-- Migración 270: el aviso automático de ubicación ahora dice cuánto falta (2026-09-05).
--
-- POR QUÉ
-- El mapa solo no responde la pregunta que de verdad tiene el pasajero. Yolima veía (o
-- habría visto, ver migración 269) un punto en el mapa, pero no si eran 2 minutos o 15.
-- El ETA se calcula en la edge function y se pega a la ETIQUETA del mapa
-- ("Va en camino a recogerte · llega en ~4 min"), no en un mensaje aparte: aparece justo
-- donde la persona está mirando y no gasta un mensaje más de WhatsApp.
--
-- ESTE CAMBIO SOLO AGREGA LAS COORDENADAS DEL PUNTO DE RECOGIDA AL PAYLOAD.
-- Se mandan desde acá en vez de que la edge function las consulte, para no hacer una
-- consulta a la base por cada pasajero cada 4 minutos -- el cron ya tiene la fila del viaje
-- en la mano.
--
-- Todo lo demás queda idéntico a la migración 269 (incluido el `::jsonb` que allá se
-- corrigió; ojo con volver a poner `::text`, ya se reintrodujo una vez).

CREATE OR REPLACE FUNCTION public.ag_wa_broadcast_live_locations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tr.id, tr.wa_phone, dl.lat, dl.lng, tr.driver_stage, tr.service_type, tr.for_other,
           tr.origin_lat, tr.origin_lng
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
        'origin_lat',      r.origin_lat,
        'origin_lng',      r.origin_lng,
        'driver_stage',    r.driver_stage,
        'service_type',    r.service_type,
        'for_other',       r.for_other
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END LOOP;
END;
$function$;
