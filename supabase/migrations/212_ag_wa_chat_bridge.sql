-- Migración 212: puente de chat entre la app del conductor y el pasajero de
-- WhatsApp -- pedido explícito del usuario 2026-08-11.
--
-- Hoy `ag_chat_messages` es puramente interno: si el conductor le escribe al
-- pasajero desde el chat de la app en un viaje pedido por WhatsApp, el
-- mensaje se guarda en la tabla pero nadie se lo reenvía -- el pasajero de
-- WhatsApp no tiene la app, así que nunca lo ve. Este trigger cubre ESE
-- sentido (conductor -> pasajero). El sentido contrario (pasajero por
-- WhatsApp -> chat del conductor) se resuelve del lado del edge function
-- (ag-whatsapp/index.ts, estado in_trip), insertando directamente en esta
-- misma tabla -- no necesita trigger porque el INSERT ya lo hace el propio
-- edge function.
--
-- Prevención de loop: el INSERT que hace el edge function por el pasajero
-- usa sender_ag_user_id = el ag_user_id del PASAJERO, nunca el del
-- conductor -- este trigger solo reenvía a WhatsApp cuando quien escribió es
-- el CONDUCTOR asignado del viaje, así que nunca se dispara sobre el propio
-- mensaje que el edge function acaba de insertar (si lo hiciera, reenviaría
-- al pasajero su propio mensaje de vuelta, un eco infinito).
CREATE OR REPLACE FUNCTION public.ag_wa_chat_relay_to_passenger_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_trip              RECORD;
  v_driver_ag_user_id uuid;
  v_driver_name       text;
BEGIN
  SELECT r.id, r.source, r.wa_phone, r.driver_id, r.status
  INTO v_trip
  FROM public.ag_trip_requests r
  WHERE r.id = NEW.request_id;

  -- Solo viajes de WhatsApp activos con conductor asignado -- si no hay
  -- driver_id todavía, no hay conductor real cuyo mensaje reenviar.
  IF v_trip IS NULL
     OR v_trip.source <> 'whatsapp'
     OR v_trip.wa_phone IS NULL
     OR v_trip.driver_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT d.ag_user_id, u.full_name
  INTO v_driver_ag_user_id, v_driver_name
  FROM public.ag_drivers d
  JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE d.id = v_trip.driver_id;

  -- Filtro clave: solo reenviar si quien escribió es el conductor de este
  -- viaje específico -- ver nota de prevención de loop arriba.
  IF v_driver_ag_user_id IS NULL OR NEW.sender_ag_user_id <> v_driver_ag_user_id THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
    body    := json_build_object(
      '_internal_event',  'chat_message',
      'wa_phone',         v_trip.wa_phone,
      'trip_request_id',  v_trip.id::text,
      'driver_name',      COALESCE(v_driver_name, 'Tu conductor'),
      'message',          NEW.message
    )::jsonb,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ag_wa_chat_relay_to_passenger_trigger ON public.ag_chat_messages;
CREATE TRIGGER ag_wa_chat_relay_to_passenger_trigger
  AFTER INSERT ON public.ag_chat_messages
  FOR EACH ROW EXECUTE FUNCTION ag_wa_chat_relay_to_passenger_fn();
