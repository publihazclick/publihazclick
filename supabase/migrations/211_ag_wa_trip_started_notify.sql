-- Migración 211: avisar al pasajero de WhatsApp cuando el viaje arranca de
-- verdad hacia el destino (driver_stage -> 'on_route'), sin importar por cuál
-- lado se confirmó el abordaje.
--
-- Contexto: verificado que en la app, CUALQUIERA de los dos lados (pasajero
-- o conductor) puede confirmar "ya estoy a bordo"/"pasajero a bordo", y
-- ambos disparan la MISMA transición -- ag_advance_trip_stage(trip_id,
-- 'on_route') -- sin importar quién la llame (200_ag_fix_advance_trip_stage
-- _columns.sql autoriza tanto al pasajero como al conductor del viaje).
-- ag-whatsapp/index.ts ya se corrigió para replicar esa misma transición
-- cuando el pasajero confirma por WhatsApp (pedido explícito del usuario
-- 2026-08-11: "que inicie el viaje de ambos lados... igual que en la app").
--
-- Pero faltaba el sentido contrario: si el CONDUCTOR confirma desde la app
-- (RPC normal, con su propio auth.uid()), el pasajero de WhatsApp nunca se
-- enteraba de que el viaje ya iba en camino al destino -- se quedaba en
-- silencio en el estado in_trip sin ningún aviso, a diferencia de "el
-- conductor llegó" (206) o "viaje completado" (210), que sí tienen su propio
-- trigger. Este trigger cubre exactamente ese hueco, reusando el mismo
-- patrón que los otros dos eventos de este canal.
CREATE OR REPLACE FUNCTION public.ag_wa_trip_started_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_driver_name text;
BEGIN
  IF NEW.driver_stage = 'on_route'
     AND (OLD.driver_stage IS NULL OR OLD.driver_stage <> 'on_route')
     AND NEW.source = 'whatsapp'
     AND NEW.wa_phone IS NOT NULL
  THEN
    SELECT u.full_name INTO v_driver_name
    FROM ag_drivers d JOIN ag_users u ON u.id = d.ag_user_id
    WHERE d.id = NEW.driver_id;

    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'trip_started',
        'wa_phone',        NEW.wa_phone,
        'trip_request_id', NEW.id::text,
        'driver_name',     COALESCE(v_driver_name, 'Tu conductor')
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ag_wa_trip_started_trigger ON public.ag_trip_requests;
CREATE TRIGGER ag_wa_trip_started_trigger
  AFTER UPDATE ON public.ag_trip_requests
  FOR EACH ROW EXECUTE FUNCTION ag_wa_trip_started_fn();
