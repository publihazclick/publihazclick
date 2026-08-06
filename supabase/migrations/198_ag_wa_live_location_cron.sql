-- ════════════════════════════════════════════════════════════
-- 198: Ubicación en vivo automática para pasajeros de WhatsApp
-- ════════════════════════════════════════════════════════════
-- Cada pocos minutos, mientras el viaje sigue activo (aceptado, aún no
-- llegó al destino), se le manda al pasajero por WhatsApp un link de
-- Google Maps con la posición actual del conductor -- sin que el
-- pasajero (que no tiene la app) tenga que pedirlo.

CREATE OR REPLACE FUNCTION ag_wa_broadcast_live_locations()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tr.wa_phone, dl.lat, dl.lng, tr.driver_stage
    FROM ag_trip_requests tr
    JOIN ag_driver_locations dl ON dl.driver_id = tr.driver_id
    WHERE tr.source = 'whatsapp'
      AND tr.status = 'accepted'
      AND tr.wa_phone IS NOT NULL
      AND tr.driver_id IS NOT NULL
      AND COALESCE(tr.driver_stage, 'heading_to_pickup') <> 'arrived_at_destination'
  LOOP
    PERFORM net.http_post(
      url     := 'https://hndhgtnjyjwrnzdcgcca.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'live_location',
        'wa_phone',        r.wa_phone,
        'lat',             r.lat,
        'lng',             r.lng,
        'driver_stage',    r.driver_stage
      )::text,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'movi-wa-live-location',
  '*/4 * * * *',
  $$SELECT ag_wa_broadcast_live_locations();$$
);
