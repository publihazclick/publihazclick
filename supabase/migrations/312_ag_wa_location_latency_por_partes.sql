-- 312: cronómetro por partes para la ubicación compartida por WhatsApp (2026-10-05).
-- La columna ms (migración 239) mide hasta el final del webhook, incluido lo que pasa
-- DESPUÉS de contestar. Para saber exactamente qué se volvió lento la próxima vez:
--   geo_ms       = dirección (Mapbox + barrio) + sesión + ruta, antes de contestar
--   respuesta_ms = momento en que el pasajero ya tiene la respuesta en su chat
ALTER TABLE public.ag_wa_location_latency
  ADD COLUMN IF NOT EXISTS geo_ms integer,
  ADD COLUMN IF NOT EXISTS respuesta_ms integer;
