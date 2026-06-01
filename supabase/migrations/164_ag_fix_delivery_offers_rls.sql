-- Migration 164: Fix ag_delivery_offers RLS — columna d.user_id → ag_current_driver_id()
-- Las políticas originales (mig 166) referenciaban d.user_id (columna inexistente en ag_drivers).
-- La columna correcta es ag_user_id. Se reemplaza por ag_current_driver_id() SECURITY DEFINER
-- para evitar recursión y usar el mismo patrón que las demás políticas.

DROP POLICY IF EXISTS "agdo_select" ON ag_delivery_offers;
CREATE POLICY "agdo_select" ON ag_delivery_offers FOR SELECT USING (
  driver_id = ag_current_driver_id()
  OR delivery_request_id IN (
    SELECT id FROM ag_delivery_requests
    WHERE passenger_id = ag_current_user_id()
  )
);

DROP POLICY IF EXISTS "agdo_insert" ON ag_delivery_offers;
CREATE POLICY "agdo_insert" ON ag_delivery_offers FOR INSERT WITH CHECK (
  driver_id = ag_current_driver_id()
);

DROP POLICY IF EXISTS "agdo_update" ON ag_delivery_offers;
CREATE POLICY "agdo_update" ON ag_delivery_offers FOR UPDATE USING (
  driver_id = ag_current_driver_id()
  OR delivery_request_id IN (
    SELECT id FROM ag_delivery_requests
    WHERE passenger_id = ag_current_user_id()
  )
);
