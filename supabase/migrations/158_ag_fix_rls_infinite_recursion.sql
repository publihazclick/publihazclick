-- Migration 158: Fix infinite recursion en ag_users RLS
-- Causa: políticas de mig 157 hacían subqueries en ag_users desde dentro de la propia política ag_users
-- Solución: funciones SECURITY DEFINER que bypasean RLS al resolver IDs

CREATE OR REPLACE FUNCTION ag_current_user_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM ag_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION ag_current_driver_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM ag_drivers
  WHERE ag_user_id = (SELECT id FROM ag_users WHERE auth_user_id = auth.uid() LIMIT 1)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION ag_current_user_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION ag_current_driver_id() TO authenticated, anon;

-- ag_users: política sin auto-referencia
DROP POLICY IF EXISTS "ag_users_trip_participants" ON ag_users;
CREATE POLICY "ag_users_trip_participants" ON ag_users FOR SELECT USING (
  id IN (
    SELECT passenger_user_id FROM ag_trip_requests
    WHERE driver_id = ag_current_driver_id()
  )
  OR
  id IN (
    SELECT ag_user_id FROM ag_drivers WHERE id IN (
      SELECT driver_id FROM ag_trip_requests
      WHERE passenger_user_id = ag_current_user_id()
    )
  )
);

-- ag_drivers: política sin subquery recursiva en ag_users
DROP POLICY IF EXISTS "ag_drivers_trip_participants" ON ag_drivers;
CREATE POLICY "ag_drivers_trip_participants" ON ag_drivers FOR SELECT USING (
  id IN (
    SELECT driver_id FROM ag_trip_requests
    WHERE passenger_user_id = ag_current_user_id()
  )
);

-- ag_trip_requests: reemplazar las 3 políticas con funciones seguras
DROP POLICY IF EXISTS "trip_requests_driver_assigned" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_assigned" ON ag_trip_requests
  FOR SELECT USING (driver_id = ag_current_driver_id());

DROP POLICY IF EXISTS "trip_requests_driver_offer_accepted" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_offer_accepted" ON ag_trip_requests
  FOR SELECT USING (
    id IN (
      SELECT trip_request_id FROM ag_trip_offers
      WHERE status = 'accepted'
        AND driver_id = ag_current_driver_id()
    )
  );

DROP POLICY IF EXISTS "trip_requests_driver_update_stage" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_update_stage" ON ag_trip_requests
  FOR UPDATE USING (driver_id = ag_current_driver_id());
