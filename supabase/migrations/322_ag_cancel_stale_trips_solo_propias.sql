-- 322 (2026-10-06): "estamos cancelando una solicitud aunque el pasajero le dio Seguir buscando".
--
-- ag_cancel_stale_trips() la llama la app CADA VEZ que un pasajero abre Movi (anda-gana.component.ts,
-- cancelStaleTrips). Cancelaba TODAS las solicitudes 'searching' de TODOS los pasajeros con más de
-- 12 min desde created_at -- incluidas las de WhatsApp y las que el pasajero acababa de pedir
-- "Seguir buscando" -- sin motivo escrito (24 cancelaciones "sin motivo" en 60 días). Además la podía
-- ejecutar cualquiera con la llave pública, sin sesión.
--
-- Ahora: solo las solicitudes DEL pasajero que la llama, solo de la app (las de WhatsApp las maneja
-- ag_wa_stale_search_check, que respeta "Seguir buscando"), contando 12 min desde la última vez que
-- se reabrió (driver_visible_since, que reinician Seguir buscando y Subir oferta), sin ofertas
-- pendientes, y con motivo. Sin permiso para anon.

CREATE OR REPLACE FUNCTION public.ag_cancel_stale_trips()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_count integer;
BEGIN
  UPDATE ag_trip_requests tr
    SET status = 'cancelled', cancelled_at = now(), updated_at = now(),
        cancel_reason = 'Sin respuesta: el pasajero volvió a abrir la app con la solicitud vencida'
  WHERE tr.status = 'searching'
    AND tr.passenger_user_id = public.ag_current_user_id()
    AND COALESCE(tr.source, 'app') <> 'whatsapp'
    AND COALESCE(tr.driver_visible_since, tr.created_at) < now() - interval '12 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM ag_trip_offers o WHERE o.trip_request_id = tr.id AND o.status = 'pending'
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ag_cancel_stale_trips() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ag_cancel_stale_trips() TO authenticated;
