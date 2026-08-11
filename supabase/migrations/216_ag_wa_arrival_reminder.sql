-- Migración 216: recordatorio de "te quedan 2 minutos" por WhatsApp cuando el
-- conductor ya llegó al punto de recogida y el pasajero todavía no aborda.
-- Pedido explícito del usuario 2026-08-11, siguiendo el mismo patrón ya usado
-- para la ubicación en vivo (migración 198, ag_wa_broadcast_live_locations):
-- un cron que corre cada minuto y llama a ag-whatsapp con un _internal_event.
--
-- wa_arrival_reminder_sent evita mandar el recordatorio más de una vez por
-- viaje -- el cron corre cada minuto, así que sin esta bandera podría
-- reenviarse en cada corrida mientras el pasajero sigue sin abordar.
ALTER TABLE public.ag_trip_requests
  ADD COLUMN IF NOT EXISTS wa_arrival_reminder_sent boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION ag_wa_arrival_reminder()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_driver_name text;
BEGIN
  FOR r IN
    SELECT tr.id, tr.wa_phone, tr.driver_id
    FROM ag_trip_requests tr
    WHERE tr.source = 'whatsapp'
      AND tr.status = 'accepted'
      AND tr.driver_stage = 'arrived_at_pickup'
      -- Domicilio/flete no aplican -- ahí no hay "abordar el vehículo", es
      -- una entrega de paquete, el aviso de los 4 minutos ni siquiera se le
      -- muestra en el mensaje de llegada (ver ag-whatsapp/index.ts).
      AND COALESCE(tr.service_type, 'carro') NOT IN ('domicilio', 'flete')
      AND tr.wa_phone IS NOT NULL
      AND tr.wa_arrival_reminder_sent = false
      -- Ventana amplia (2 a 4 minutos) en vez de un punto exacto: el cron
      -- corre cada minuto, así que un viaje puede quedar en este estado
      -- varias corridas seguidas -- la bandera de arriba es lo que evita el
      -- reenvío, este rango es solo para no mandarlo antes de tiempo ni
      -- (por algún hueco) dejarlo pasar del todo.
      AND tr.updated_at <= now() - interval '2 minutes'
      AND tr.updated_at >  now() - interval '4 minutes'
  LOOP
    SELECT u.full_name INTO v_driver_name
    FROM ag_drivers d JOIN ag_users u ON u.id = d.ag_user_id
    WHERE d.id = r.driver_id;

    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'arrival_reminder',
        'wa_phone',        r.wa_phone,
        'driver_name',     COALESCE(v_driver_name, 'Tu conductor')
      )::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );

    UPDATE ag_trip_requests SET wa_arrival_reminder_sent = true WHERE id = r.id;
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'movi-wa-arrival-reminder',
  '* * * * *',
  $$SELECT ag_wa_arrival_reminder();$$
);
