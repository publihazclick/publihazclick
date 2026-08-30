-- Rediseño de "Subir oferta" (dentro del flujo de aviso proactivo de la migración 241): antes
-- aplicaba un +15% ciego sin preguntar. Ahora el bot sugiere un monto (mismos pasos que ya usa
-- la app en adjustTripPriceSmart(), no un porcentaje) y el pasajero puede aceptarlo o escribir
-- el suyo, con protección contra errores de tipeo si el monto es mucho mayor al actual.

ALTER TABLE public.ag_trip_requests
  ADD COLUMN IF NOT EXISTS initial_offered_price INT;

-- Monto propuesto mientras se espera la confirmación anti-typo (estado stale_raise_offer_confirm_high).
ALTER TABLE public.ag_wa_sessions
  ADD COLUMN IF NOT EXISTS pending_raise_amount INT;
