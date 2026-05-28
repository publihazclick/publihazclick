-- Migration 157: Fix RLS — conductor puede leer ag_trip_requests cuando tiene oferta aceptada
-- Cubre el caso donde migration 147 no fue aplicada o driver_id aun no esta seteado

-- 1. Conductores ven solicitudes donde son conductor asignado (driver_id match)
DROP POLICY IF EXISTS "trip_requests_driver_assigned" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_assigned" ON ag_trip_requests
  FOR SELECT USING (
    driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- 2. Conductores ven solicitudes donde tienen una oferta aceptada (belt-and-suspenders)
DROP POLICY IF EXISTS "trip_requests_driver_offer_accepted" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_offer_accepted" ON ag_trip_requests
  FOR SELECT USING (
    id IN (
      SELECT trip_request_id FROM ag_trip_offers
      WHERE status = 'accepted'
        AND driver_id IN (
          SELECT id FROM ag_drivers WHERE ag_user_id IN (
            SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
          )
        )
    )
  );

-- 3. Conductores pueden actualizar driver_stage de sus viajes asignados
DROP POLICY IF EXISTS "trip_requests_driver_update_stage" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_update_stage" ON ag_trip_requests
  FOR UPDATE USING (
    driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- 4. Participantes de viajes activos pueden ver perfil basico del otro
DROP POLICY IF EXISTS "ag_users_trip_participants" ON ag_users;
CREATE POLICY "ag_users_trip_participants" ON ag_users FOR SELECT USING (
  id IN (
    SELECT passenger_user_id FROM ag_trip_requests
    WHERE driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  )
  OR
  id IN (
    SELECT ag_user_id FROM ag_drivers WHERE id IN (
      SELECT driver_id FROM ag_trip_requests
      WHERE passenger_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  )
);

-- 5. Pasajeros ven datos del conductor asignado
DROP POLICY IF EXISTS "ag_drivers_trip_participants" ON ag_drivers;
CREATE POLICY "ag_drivers_trip_participants" ON ag_drivers FOR SELECT USING (
  id IN (
    SELECT driver_id FROM ag_trip_requests
    WHERE passenger_user_id IN (
      SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
    )
  )
);
