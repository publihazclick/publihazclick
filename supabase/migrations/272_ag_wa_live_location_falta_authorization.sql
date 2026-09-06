-- Migración 272: el Authorization que le faltaba a la ubicación en vivo (2026-09-05).
--
-- OJO — CORRECCIÓN DE UN DIAGNÓSTICO EQUIVOCADO. Se vio un 403 clavado cada 4 minutos en
-- `net._http_response` y se atribuyó a este cron, que corre justo cada 4 minutos. **Era
-- falso.** Hay TRES crons con ese intervalo, y el 403 es de `movi-wa-warm-keeper`, que hace
-- un `net.http_get` a `ag-whatsapp` sin credenciales: esa ruta GET es la verificación de
-- webhook de Meta y responde 403 cuando no trae el token. **Ese 403 es correcto y esperado**
-- — el warm keeper solo existe para despertar la función y lo consigue igual. No hay nada
-- que arreglar ahí. Y este cron no había hecho NINGUNA petición: con 0 viajes de WhatsApp
-- activos, el bucle nunca ejecuta su cuerpo.
--
-- LO QUE SÍ QUEDA, Y POR QUÉ VALE LA PENA IGUAL
-- Este era el único cron del proyecto que hacía su POST sin encabezado `Authorization`; todos
-- los demás (`ag_cancel_abandoned_trips`, `ag_driver_wait_prompt`, `ag_health_check`…) mandan
-- la service_role_key del vault y funcionan. Como este camino **nunca se ha ejecutado con un
-- viaje real** desde que se arregló (migración 269), no hay ninguna prueba de que funcione
-- sin autorización: se alinea con el resto en vez de dejarlo como la única excepción sin
-- verificar. De paso pasa a leer la URL del vault, como los demás.
--
-- LAS DOS LECCIONES QUE SÍ SIRVEN
-- 1. `cron.job_run_details` NO dice si las peticiones HTTP funcionaron: `pg_net` es asíncrono
--    y la función retorna antes de la respuesta. Mirar `net._http_response`.
-- 2. Un patrón temporal (algo cada 4 minutos) NO identifica al culpable si hay varios
--    procesos con el mismo intervalo. Confirmar el emisor antes de arreglar nada.

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
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;

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
      url     := v_url || '/functions/v1/ag-whatsapp',
      -- Se alinea con el resto de crons del proyecto, que sí mandan la service_role_key.
      -- Este camino nunca se ha ejecutado con un viaje real, así que no había prueba de
      -- que funcionara sin autorización.
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
        'for_other',       r.for_other
      )::jsonb,
      timeout_milliseconds := 8000
    );
  END LOOP;
END;
$function$;
