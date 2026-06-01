-- Migration 162: Fix definitivo — todos los ciclos RLS ag_*
-- Ciclos detectados en producción:
--   ag_trip_offers.passenger_sees_offers -> ag_trip_requests
--   ag_trip_requests.trip_requests_driver_offer_accepted -> ag_trip_offers  (ciclo cerrado)
--   ag_users.ag_users_trip_participants -> ag_trip_requests -> ag_trip_offers -> ag_users (triángulo)
-- Solución: usar ag_current_user_id() / ag_current_driver_id() SECURITY DEFINER en todas las políticas
--           + eliminar ag_users_trip_participants (redundante con ag_users_select_by_phone USING true)
--           + eliminar trip_requests_driver_offer_accepted (redundante con trip_requests_driver_assigned)

-- ag_users
DROP POLICY IF EXISTS "ag_users_trip_participants" ON ag_users;

-- ag_trip_requests
DROP POLICY IF EXISTS "trip_requests_driver_offer_accepted" ON ag_trip_requests;

-- ag_trip_offers
DROP POLICY IF EXISTS "driver_sees_own_offers" ON ag_trip_offers;
CREATE POLICY "driver_sees_own_offers" ON ag_trip_offers
  FOR SELECT USING (driver_id = ag_current_driver_id());

DROP POLICY IF EXISTS "passenger_sees_offers" ON ag_trip_offers;
CREATE POLICY "passenger_sees_offers" ON ag_trip_offers
  FOR SELECT USING (
    trip_request_id IN (SELECT id FROM ag_trip_requests WHERE passenger_user_id = ag_current_user_id())
  );

DROP POLICY IF EXISTS "passenger_update_offer" ON ag_trip_offers;
CREATE POLICY "passenger_update_offer" ON ag_trip_offers
  FOR UPDATE USING (
    trip_request_id IN (SELECT id FROM ag_trip_requests WHERE passenger_user_id = ag_current_user_id())
  );

-- ag_trips
DROP POLICY IF EXISTS "ag_trips_own" ON ag_trips;
CREATE POLICY "ag_trips_own" ON ag_trips FOR ALL USING (driver_id = ag_current_driver_id());

-- ag_wallet_transactions
DROP POLICY IF EXISTS "driver_sees_own_wallet" ON ag_wallet_transactions;
CREATE POLICY "driver_sees_own_wallet" ON ag_wallet_transactions
  FOR SELECT USING (driver_id = ag_current_driver_id());

-- ag_wallet_payments
DROP POLICY IF EXISTS "driver_sees_own_wallet_payments" ON ag_wallet_payments;
CREATE POLICY "driver_sees_own_wallet_payments" ON ag_wallet_payments
  FOR SELECT USING (driver_id = ag_current_driver_id());

-- ag_withdrawals
DROP POLICY IF EXISTS "ag_wd_owner_or_admin" ON ag_withdrawals;
CREATE POLICY "ag_wd_owner_or_admin" ON ag_withdrawals FOR ALL USING (
  driver_id = ag_current_driver_id()
  OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = ANY(ARRAY['admin'::user_role,'dev'::user_role]))
);

-- ag_online_sessions
DROP POLICY IF EXISTS "ag_sessions_owner" ON ag_online_sessions;
CREATE POLICY "ag_sessions_owner" ON ag_online_sessions FOR ALL USING (driver_id = ag_current_driver_id());

-- ag_quest_progress
DROP POLICY IF EXISTS "ag_qp_owner" ON ag_quest_progress;
CREATE POLICY "ag_qp_owner" ON ag_quest_progress FOR ALL USING (driver_id = ag_current_driver_id());

-- ag_passenger_blacklist
DROP POLICY IF EXISTS "ag_bl_owner" ON ag_passenger_blacklist;
CREATE POLICY "ag_bl_owner" ON ag_passenger_blacklist FOR ALL USING (driver_id = ag_current_driver_id());

-- ag_driver_vehicles
DROP POLICY IF EXISTS "ag_dv_owner" ON ag_driver_vehicles;
CREATE POLICY "ag_dv_owner" ON ag_driver_vehicles FOR ALL USING (driver_id = ag_current_driver_id());
