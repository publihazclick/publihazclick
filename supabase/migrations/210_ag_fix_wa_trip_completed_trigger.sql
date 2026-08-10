-- Migración 210: dos bugs reales del canal WhatsApp de Movi reportados por el usuario.
--
-- 1. "Ya estoy a bordo" llegaba ANTES que "el conductor ya llegó" -- causa raíz real:
--    había DOS sistemas mandando WhatsApp para el mismo evento en paralelo y sin
--    coordinación entre sí: el trigger de DB (ag_wa_driver_arrived_fn, texto + mapa +
--    botón) Y una llamada directa desde el frontend (_sendWhatsApp en
--    anda-gana.component.ts, advanceStage()) que manda un texto plano simple para el
--    mismo evento. Como son dos código completamente independientes (uno vía pg_net
--    desde Postgres, otro vía fetch desde el navegador), no hay garantía de orden de
--    llegada entre ellos -- de ahí el desorden. Se agrega 'source' al RPC
--    ag_get_my_active_trips para que el frontend pueda distinguir los viajes de
--    WhatsApp y dejar de mandar su copia duplicada en esos casos (el trigger de DB ya
--    los cubre completo, con mejor experiencia).
--
-- 2. El recibo/calificación de "viaje completado" JAMÁS llegaba al pasajero por
--    WhatsApp -- causa raíz real: el trigger ag_wa_trip_completed_fn escuchaba
--    driver_stage = 'arrived_at_destination', pero el botón real de "Finalizar viaje"
--    del conductor (finishDriverTrip → completeTrip → RPC ag_complete_trip) NUNCA pasa
--    por ese valor -- salta directo a driver_stage = 'completed' junto con
--    status = 'completed'. La condición del trigger nunca se cumplía en un viaje real
--    (solo en las pruebas sintéticas donde se forzó el valor a mano por SQL). Se
--    corrige para escuchar la transición real y garantizada: status = 'completed'.

CREATE OR REPLACE FUNCTION public.ag_get_my_active_trips()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_driver_id uuid;
  v_result jsonb;
BEGIN
  v_driver_id := ag_current_driver_id();
  IF v_driver_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'trip_request_id', o.trip_request_id,
      'driver_id', o.driver_id,
      'offered_price', o.offered_price,
      'status', o.status,
      'updated_at', o.updated_at,
      'ag_trip_requests', jsonb_build_object(
        'id', r.id,
        'status', r.status,
        'driver_stage', r.driver_stage,
        'source', r.source,
        'origin_name', r.origin_name,
        'origin_lat', r.origin_lat,
        'origin_lng', r.origin_lng,
        'dest_name', r.dest_name,
        'dest_lat', r.dest_lat,
        'dest_lng', r.dest_lng,
        'payment_method', r.payment_method,
        'ag_users', jsonb_build_object(
          'full_name', u.full_name,
          'phone', u.phone,
          'selfie_url', u.selfie_url,
          'auth_user_id', u.auth_user_id
        )
      )
    )
  ) INTO v_result
  FROM ag_trip_offers o
  JOIN ag_trip_requests r ON r.id = o.trip_request_id
  JOIN ag_users u ON u.id = r.passenger_user_id
  WHERE o.driver_id = v_driver_id
    AND o.status = 'accepted'
    AND r.status NOT IN ('completed', 'cancelled');
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

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
