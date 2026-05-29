-- =============================================================================
-- Migration 164: Conductores pueden ver solicitudes canceladas (para detectar
-- cancelaciones en tiempo real y en el polling de estado)
-- =============================================================================

-- La política anterior solo mostraba status='searching', por lo que cuando el
-- pasajero cancelaba, la fila desaparecía para el conductor y nunca se borraba
-- de su pantalla (RLS filtraba tanto el evento realtime como el poll de estado).

DROP POLICY IF EXISTS "trip_requests_drivers_read" ON ag_trip_requests;
CREATE POLICY "trip_requests_drivers_read" ON ag_trip_requests
  FOR SELECT USING (status IN ('searching', 'cancelled'));
