-- Migration 159: Fix trip_requests_own policy causing infinite recursion
-- La política "trip_requests_own" (ALL) tenía: passenger_user_id IN (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
-- Esto consulta ag_users → activa ag_users_trip_participants → consulta ag_trip_requests → loop infinito
-- Solución: usar ag_current_user_id() SECURITY DEFINER que bypasea RLS

DROP POLICY IF EXISTS "trip_requests_own" ON ag_trip_requests;
CREATE POLICY "trip_requests_own" ON ag_trip_requests
  FOR ALL
  USING (passenger_user_id = ag_current_user_id())
  WITH CHECK (passenger_user_id = ag_current_user_id());
