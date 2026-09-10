-- ═══════════════════════════════════════════════════════════════════════════
-- 283 — El aviso "💰 Oferta de conductor" también lleva los dos teléfonos
--
-- La migración 282 cubrió los avisos que salen de `ag_trip_requests`, pero este
-- sale de un trigger sobre `ag_trip_offers` y se había quedado por fuera. Es el
-- aviso que llega ANTES de que el pasajero acepte: si dos conductores ofertan,
-- llegan dos de estos, y sin teléfono no se puede hacer nada con ellos.
--
-- Reusa el mismo helper `ag_admin_contactos` de la 282, pasándole el conductor
-- de ESTA oferta (no el asignado al viaje, que en este punto todavía es NULL).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.ag_admin_notify_offer_made()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_pas_user uuid;
  v_wa_phone text;
BEGIN
  SELECT t.passenger_user_id, t.wa_phone
    INTO v_pas_user, v_wa_phone
    FROM public.ag_trip_requests t
   WHERE t.id = NEW.trip_request_id;

  PERFORM public.ag_notify_admin_live_event(
    '💰 Oferta de conductor',
    -- El driver_id va como el "conductor" del contacto: es quien acaba de ofertar.
    public.ag_admin_contactos(v_pas_user, NEW.driver_id, v_wa_phone) ||
    ' · ofrece $' || to_char(NEW.offered_price, 'FM999G999G999')
  );
  RETURN NEW;
END;
$function$;
