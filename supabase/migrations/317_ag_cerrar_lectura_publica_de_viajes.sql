-- 317 (2026-10-05): cerrar la lectura pública de viajes (fuga de teléfonos de pasajeros).
--
-- Encontrado ese día probando con la llave PÚBLICA de la app y SIN iniciar sesión: la regla
-- trip_requests_drivers_read (para que los conductores vean las solicitudes) dejaba leer a CUALQUIERA
-- (rol public, incluido anon) todos los viajes en 'searching' y TODOS los 'cancelled' de la historia.
-- Con select('*') eso traía wa_phone (WhatsApp del pasajero) y for_other (teléfono de "otra persona" y
-- de quien pidió): 24 números distintos en 82 viajes, más 8 viajes "para otra persona".
--
-- Ahora: solo usuarios con sesión que SEAN conductores, solo 'searching' y 'cancelled' de las últimas
-- 6 horas (la app solo necesita las canceladas recientes para quitarlas de la lista del conductor, por
-- el tiempo real). El pasajero sigue viendo los suyos (trip_requests_own) y el conductor el asignado
-- (trip_requests_driver_assigned); nada de eso cambia. Bot, crons y funciones usan la llave de
-- servicio y no pasan por estas reglas.
--
-- Paso previo necesario: 7 de 31 cancelaciones recientes NO cambiaban updated_at (venían de caminos
-- que no lo ponían), así que el filtro de 6 horas las habría escondido justo en el momento de
-- cancelarse. El trigger de abajo pone updated_at = now() en todo cambio de estado, venga de donde venga.
--
-- Pendiente (necesita la web): que la app no pida wa_phone / for_other / recipient_phone en las
-- consultas de los conductores, y quitarles el permiso de lectura de esas columnas.

CREATE OR REPLACE FUNCTION public.ag_estampar_cambio_estado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_estampar_cambio_estado ON public.ag_trip_requests;
CREATE TRIGGER trg_ag_estampar_cambio_estado
  BEFORE UPDATE OF status ON public.ag_trip_requests
  FOR EACH ROW EXECUTE FUNCTION public.ag_estampar_cambio_estado();

DROP POLICY IF EXISTS trip_requests_drivers_read ON public.ag_trip_requests;
CREATE POLICY trip_requests_drivers_read ON public.ag_trip_requests
  FOR SELECT TO authenticated
  USING (
    (SELECT public.ag_current_driver_id()) IS NOT NULL
    AND (
      status = 'searching'
      OR (status = 'cancelled' AND updated_at > now() - interval '6 hours')
    )
  );

-- Para volver atrás (regla anterior, tal cual estaba):
--   DROP POLICY IF EXISTS trip_requests_drivers_read ON public.ag_trip_requests;
--   CREATE POLICY trip_requests_drivers_read ON public.ag_trip_requests FOR SELECT TO public
--     USING (status = ANY (ARRAY['searching'::text, 'cancelled'::text]));
