-- Migration 161: Fix definitivo — recursión infinita en políticas RLS ag_users
-- Cadena de recursión:
--   ag_trip_requests.trip_requests_own → SELECT ag_users → ag_users_trip_participants
--   → SELECT ag_trip_requests → trip_requests_own → loop
-- También: ag_drivers_own → SELECT ag_users → ag_users_trip_participants
--   → SELECT ag_drivers → ag_drivers_own → loop
-- Solución: todas las referencias cruzadas usan funciones SECURITY DEFINER que bypasean RLS

-- ── Funciones helper que bypasean RLS ──────────────────────────────────────
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

GRANT EXECUTE ON FUNCTION ag_current_user_id()   TO authenticated, anon;
GRANT EXECUTE ON FUNCTION ag_current_driver_id() TO authenticated, anon;

-- ── ag_users ────────────────────────────────────────────────────────────────
-- Política propia: no toca ag_users, usa auth.uid() directo — OK
DROP POLICY IF EXISTS "ag_users_own" ON ag_users;
CREATE POLICY "ag_users_own" ON ag_users
  FOR ALL USING (auth.uid() = auth_user_id);

-- Participantes de viaje: usa SECURITY DEFINER, sin auto-referencia
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

-- ── ag_trip_requests ────────────────────────────────────────────────────────
-- Pasajero ve/modifica sus propias solicitudes
DROP POLICY IF EXISTS "trip_requests_own" ON ag_trip_requests;
CREATE POLICY "trip_requests_own" ON ag_trip_requests
  FOR ALL
  USING    (passenger_user_id = ag_current_user_id())
  WITH CHECK (passenger_user_id = ag_current_user_id());

-- Conductores ven solicitudes donde son el asignado
DROP POLICY IF EXISTS "trip_requests_driver_assigned" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_assigned" ON ag_trip_requests
  FOR SELECT USING (driver_id = ag_current_driver_id());

-- Conductores ven solicitudes donde tienen oferta aceptada
DROP POLICY IF EXISTS "trip_requests_driver_offer_accepted" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_offer_accepted" ON ag_trip_requests
  FOR SELECT USING (
    id IN (
      SELECT trip_request_id FROM ag_trip_offers
      WHERE status = 'accepted'
        AND driver_id = ag_current_driver_id()
    )
  );

-- Conductores actualizan driver_stage de sus viajes
DROP POLICY IF EXISTS "trip_requests_driver_update_stage" ON ag_trip_requests;
CREATE POLICY "trip_requests_driver_update_stage" ON ag_trip_requests
  FOR UPDATE USING (driver_id = ag_current_driver_id());

-- ── ag_drivers ──────────────────────────────────────────────────────────────
-- Conductor ve/modifica su propio perfil
DROP POLICY IF EXISTS "ag_drivers_own" ON ag_drivers;
CREATE POLICY "ag_drivers_own" ON ag_drivers FOR ALL
  USING (ag_user_id = ag_current_user_id());

-- Pasajeros ven datos del conductor asignado a su viaje
DROP POLICY IF EXISTS "ag_drivers_trip_participants" ON ag_drivers;
CREATE POLICY "ag_drivers_trip_participants" ON ag_drivers FOR SELECT USING (
  id IN (
    SELECT driver_id FROM ag_trip_requests
    WHERE passenger_user_id = ag_current_user_id()
  )
);
