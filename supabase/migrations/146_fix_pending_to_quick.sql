-- Conductores que se registraron antes del flujo quick y tienen 0 viajes completados
-- deben quedar en status 'quick' para poder tomar su primera carrera gratis.
UPDATE public.ag_drivers
SET status = 'quick'
WHERE status = 'pending'
  AND COALESCE(metric_trips_completed, 0) = 0;
