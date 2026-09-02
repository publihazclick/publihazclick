-- 258: no avisar "nadie la ha aceptado" ni cerrar la solicitud si hay una oferta esperando
--
-- El 2026-09-02 se perdio un viaje real por esto. Cronologia de la solicitud
-- bc2548a2-23e3-491b-8af5-6683559d1163 (pasajero por WhatsApp, Cucuta, 6,2 km):
--
--   17:09  pide el viaje y ofrece 16.000 (el precio que le sugirio el bot)
--   17:10  un conductor oferta 25.000; el pasajero lo rechaza
--   17:17  OTRO conductor oferta 19.000 -> la oferta le queda en pantalla esperando respuesta
--   17:19  el bot le dice "15 conductores vieron tu solicitud, pero ninguno la ha aceptado"
--   17:24  se lo repite
--   17:28  se lo repite otra vez
--   17:32  cierra la solicitud: "No encontramos conductor disponible esta vez"
--
-- La oferta de 19.000 seguia viva todo ese rato (sigue registrada como 'pending'). O sea que
-- el bot le dijo tres veces que nadie lo queria llevar mientras tenia un conductor esperando,
-- y despues le cerro el pedido. Por 3.000 de diferencia.
--
-- Causa: los dos bucles de ag_wa_stale_search_check preguntaban solo si la solicitud seguia en
-- 'searching' y si habian pasado 4 minutos. Nunca miraban ag_trip_offers, asi que trataban
-- igual a un pedido que nadie miro y a uno con una oferta encima.
--
-- Arreglo: los dos bucles ignoran las solicitudes que tengan una oferta 'pending' de menos de
-- 30 minutos. El limite es a proposito: sin el, se volveria al problema que resolvio la
-- migracion 256 (solicitudes abiertas para siempre) cuando el pasajero no contesta la oferta.
-- Pasada la media hora la solicitud vuelve al flujo normal de avisos y cierre.
--
-- Verificado contra los datos reales: simulando el instante del cierre (17:32) con esta
-- condicion puesta, la solicitud NO habria sido cerrada.
--
-- Queda pendiente y aparte: el contador de "cuantos vieron" dice hasta 19 cuando solo se
-- enviaron 15 notificaciones. El usuario pidio dejarlo para despues.
--
-- Aplicado en produccion el 2026-09-02 por Management API.

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
      -- No molestar ni cerrar mientras haya una oferta esperando respuesta.
      -- El 2026-09-02 se perdio un viaje real por esto: a un pasajero le ofertaron 19.000
      -- (el ofrecia 16.000, o sea 3.000 de diferencia), la oferta quedo en pantalla
      -- esperandolo, y aun asi el bot le dijo tres veces "ninguno la ha aceptado todavia"
      -- y despues cerro la solicitud con "no encontramos conductor disponible". Las dos
      -- cosas eran falsas: el conductor estaba ahi esperando.
      -- El limite de 30 minutos evita reabrir el problema que resolvio la migracion 256: si
      -- el pasajero nunca contesta la oferta, pasada la media hora la solicitud vuelve al
      -- flujo normal de avisos y cierre en vez de quedarse abierta para siempre.
      AND NOT EXISTS (
        SELECT 1 FROM public.ag_trip_offers o
        WHERE o.trip_request_id = tr.id
          AND o.status = 'pending'
          AND o.created_at > now() - interval '30 minutes'
      )
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

  -- ── Cierre: ya se le avisaron las 3 rondas y siguio sin responder ──────────────
  -- Hasta ahora una solicitud en 'searching' NO expiraba JAMAS: ag_cancel_abandoned_trips
  -- solo cancela viajes ya 'accepted' cuyo conductor se quedo mudo. Habia solicitudes de mas
  -- de 24 horas todavia abiertas, con el pasajero tecnicamente 'buscando conductor' desde el
  -- dia anterior. Es mas honesto cerrarla y decirle como volver a pedir.
  --
  -- Cancelar desde 'searching' es seguro: ag_handle_trip_cancellation solo hace algo cuando
  -- venia de 'accepted' (reembolso de comision), asi que aca es un no-op. El trigger
  -- ag_trip_unavailable_push si corre, y es lo deseable: le limpia la solicitud de la pantalla
  -- a los conductores que la tuvieran abierta.
  FOR r IN
    SELECT tr.id, tr.wa_phone, tr.for_other, tr.service_type, tr.created_at
    FROM public.ag_trip_requests tr
    WHERE tr.source = 'whatsapp'
      AND tr.status = 'searching'
      AND tr.wa_phone IS NOT NULL
      AND tr.wa_stale_check_round >= 3
      AND COALESCE(tr.wa_stale_check_sent_at, tr.created_at) <= now() - interval '4 minutes'
      -- No molestar ni cerrar mientras haya una oferta esperando respuesta.
      -- El 2026-09-02 se perdio un viaje real por esto: a un pasajero le ofertaron 19.000
      -- (el ofrecia 16.000, o sea 3.000 de diferencia), la oferta quedo en pantalla
      -- esperandolo, y aun asi el bot le dijo tres veces "ninguno la ha aceptado todavia"
      -- y despues cerro la solicitud con "no encontramos conductor disponible". Las dos
      -- cosas eran falsas: el conductor estaba ahi esperando.
      -- El limite de 30 minutos evita reabrir el problema que resolvio la migracion 256: si
      -- el pasajero nunca contesta la oferta, pasada la media hora la solicitud vuelve al
      -- flujo normal de avisos y cierre en vez de quedarse abierta para siempre.
      AND NOT EXISTS (
        SELECT 1 FROM public.ag_trip_offers o
        WHERE o.trip_request_id = tr.id
          AND o.status = 'pending'
          AND o.created_at > now() - interval '30 minutes'
      )
  LOOP
    -- Solo se avisa si la solicitud todavia es reciente. A las que llevan horas abiertas se las
    -- cierra en silencio: un 'no encontramos conductor' 24 horas despues confunde mas de lo que
    -- ayuda, y ademas la ventana de servicio de 24h de Meta ya estaria cerrada.
    IF r.created_at > now() - interval '1 hour' THEN
      PERFORM net.http_post(
        url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
        body    := json_build_object(
          '_internal_event', 'search_expired',
          'wa_phone',        r.wa_phone,
          'trip_request_id', r.id::text,
          'for_other',       r.for_other,
          'service_type',    r.service_type
        )::jsonb,
        headers := '{"Content-Type":"application/json"}'::jsonb
      );
    END IF;

    UPDATE public.ag_trip_requests
    SET status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = 'Sin conductor disponible: cerrada automaticamente'
    WHERE id = r.id;
  END LOOP;
END;
$function$
;
