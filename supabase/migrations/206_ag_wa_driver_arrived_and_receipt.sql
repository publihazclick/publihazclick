-- =============================================================================
-- Migración 206: Fase 2 de la humanización del canal WhatsApp de Movi.
--
-- 1. Aviso INSTANTÁNEO cuando el conductor llega al punto de recogida. Antes
--    el pasajero de WhatsApp solo se enteraba por el ping de ubicación en
--    vivo del cron (cada 4 minutos) -- podía tardar hasta 4 min en saber que
--    ya lo estaban esperando.
-- 2. Recibo de viaje completado con desglose real (tarifa base, distancia,
--    propina) y nombre del conductor -- antes solo mandaba el total.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ag_wa_driver_arrived_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_driver_name text;
BEGIN
  IF NEW.driver_stage = 'arrived_at_pickup'
     AND (OLD.driver_stage IS NULL OR OLD.driver_stage <> 'arrived_at_pickup')
     AND NEW.source = 'whatsapp'
     AND NEW.wa_phone IS NOT NULL
  THEN
    SELECT u.full_name INTO v_driver_name
    FROM ag_drivers d JOIN ag_users u ON u.id = d.ag_user_id
    WHERE d.id = NEW.driver_id;

    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'driver_arrived',
        'wa_phone',        NEW.wa_phone,
        'trip_request_id', NEW.id::text,
        'driver_name',     COALESCE(v_driver_name, 'Tu conductor'),
        'origin_lat',      NEW.origin_lat,
        'origin_lng',      NEW.origin_lng
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ag_wa_driver_arrived_trigger ON public.ag_trip_requests;
CREATE TRIGGER ag_wa_driver_arrived_trigger
  AFTER UPDATE ON public.ag_trip_requests
  FOR EACH ROW EXECUTE FUNCTION ag_wa_driver_arrived_fn();

CREATE OR REPLACE FUNCTION public.ag_wa_trip_completed_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_driver_name text;
BEGIN
  IF NEW.driver_stage = 'arrived_at_destination'
     AND (OLD.driver_stage IS NULL OR OLD.driver_stage <> 'arrived_at_destination')
     AND NEW.source = 'whatsapp'
     AND NEW.wa_phone IS NOT NULL
  THEN
    SELECT u.full_name INTO v_driver_name
    FROM ag_drivers d JOIN ag_users u ON u.id = d.ag_user_id
    WHERE d.id = NEW.driver_id;

    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event',  'trip_completed',
        'wa_phone',         NEW.wa_phone,
        'trip_request_id',  NEW.id::text,
        'driver_name',      COALESCE(v_driver_name, 'tu conductor'),
        'amount',           COALESCE(NEW.offered_price, 0),
        'base_fare',        COALESCE(NEW.base_fare, 0),
        'distance_fare',    COALESCE(NEW.distance_fare, 0),
        'tip_amount',       COALESCE(NEW.tip_amount, 0),
        'distance_km',      COALESCE(NEW.distance_km, 0)
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$function$;
