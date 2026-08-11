-- Migración 213: el recibo de "viaje completado" por WhatsApp mostraba un
-- precio que no coincidía con el precio real acordado (bug real reportado
-- 2026-08-11: "estás mostrando otro precio que no sé de dónde lo estás
-- tomando").
--
-- Causa raíz real: el trigger ag_wa_trip_completed_fn (migración 206,
-- redefinido en 210) mandaba 'amount' = NEW.offered_price -- pero
-- offered_price es la OFERTA INICIAL del pasajero al pedir el viaje, antes
-- de que cualquier conductor respondiera. Cuando el conductor manda una
-- contraoferta con un precio distinto y el pasajero la acepta,
-- ag_on_offer_accepted (migración 150) guarda el precio REAL acordado en
-- ag_trip_requests.final_price -- offered_price se queda congelado con el
-- valor original, sin actualizarse nunca. El trigger de WhatsApp seguía
-- leyendo la columna equivocada, así que el recibo final mostraba lo que el
-- pasajero pidió al principio, no lo que en realidad pagó.
CREATE OR REPLACE FUNCTION public.ag_wa_trip_completed_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_driver_name text;
BEGIN
  IF NEW.status = 'completed'
     AND (OLD.status IS NULL OR OLD.status <> 'completed')
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
        'amount',           COALESCE(NEW.final_price, NEW.offered_price, 0),
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
