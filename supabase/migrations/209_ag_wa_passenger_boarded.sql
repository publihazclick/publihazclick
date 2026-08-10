-- Migración 209: botón "Ya estoy a bordo" en WhatsApp cuando el conductor llega.
--
-- El pasajero confirma que ya subió al vehículo tocando un botón en WhatsApp
-- (ver evento driver_arrived / estado in_trip en ag-whatsapp/index.ts). Se
-- guarda el timestamp (evita reenviar el aviso al conductor si toca el botón
-- más de una vez) y se le avisa al conductor por push nativo, el mismo canal
-- ya usado para nuevas solicitudes -- llega aunque tenga la app cerrada.

ALTER TABLE public.ag_trip_requests ADD COLUMN IF NOT EXISTS passenger_boarded_at timestamptz;
