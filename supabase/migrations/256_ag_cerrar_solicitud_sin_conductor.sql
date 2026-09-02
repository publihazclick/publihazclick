-- 256: cerrar la solicitud cuando nadie la toma, en vez de dejar al pasajero esperando
--
-- Pedido explicito del usuario 2026-09-02, tras encontrar que una solicitud en 'searching' no
-- expiraba NUNCA. ag_cancel_abandoned_trips solo cancela viajes ya 'accepted' cuyo conductor se
-- quedo mudo, asi que las que nadie tomaba se quedaban abiertas para siempre: al momento de
-- escribir esto habia dos de mas de 22 horas, con el pasajero tecnicamente "buscando conductor"
-- desde el dia anterior.
--
-- Ahora, cuando ya se le mandaron las 3 rondas de aviso (con sus botones) y el pasajero siguio
-- sin responder, se le manda un ultimo mensaje explicando que no se encontro conductor y como
-- volver a pedir, y la solicitud se cancela. A las que llevan mas de una hora abiertas se las
-- cierra EN SILENCIO: un "no encontramos conductor" 24 horas tarde confunde mas de lo que ayuda,
-- y ademas la ventana de servicio de 24h de Meta ya estaria cerrada.
--
-- Si el pasajero SI responde ("Seguir buscando"), ag_rebroadcast_trip_request reinicia el
-- contador (migracion 255) y vuelve a tener sus 3 rondas -- o sea que esto solo cierra
-- solicitudes de gente que dejo de contestar, nunca de quien sigue esperando activamente.

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
