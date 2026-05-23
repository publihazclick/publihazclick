-- =============================================================================
-- Migration 147: RLS para flujo completo de viaje inDrive
-- =============================================================================

-- 1. Conductores pueden ver solicitudes donde son el conductor asignado
DROP POLICY IF EXISTS "trip_requests_driver_assigned" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_assigned" ON ag_trip_requests
  FOR SELECT USING (
    driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- 2. Conductores pueden actualizar el driver_stage de sus viajes asignados
DROP POLICY IF EXISTS "trip_requests_driver_update_stage" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_update_stage" ON ag_trip_requests
  FOR UPDATE USING (
    driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- 3. Participantes de viajes activos pueden ver el perfil básico del otro
--    (conductor ve al pasajero, pasajero ve al conductor)
DROP POLICY IF EXISTS "ag_users_trip_participants" ON ag_users;
CREATE POLICY "ag_users_trip_participants" ON ag_users FOR SELECT USING (
  -- Conductor ve datos del pasajero de sus viajes asignados
  id IN (
    SELECT passenger_user_id FROM ag_trip_requests
    WHERE driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  )
  OR
  -- Pasajero ve datos del conductor de su viaje aceptado
  id IN (
    SELECT ag_user_id FROM ag_drivers WHERE id IN (
      SELECT driver_id FROM ag_trip_requests
      WHERE passenger_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  )
);

-- 4. Pasajeros pueden ver datos del conductor asignado (ag_drivers)
DROP POLICY IF EXISTS "ag_drivers_trip_participants" ON ag_drivers;
CREATE POLICY "ag_drivers_trip_participants" ON ag_drivers FOR SELECT USING (
  id IN (
    SELECT driver_id FROM ag_trip_requests
    WHERE passenger_user_id IN (
      SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
    )
  )
);
