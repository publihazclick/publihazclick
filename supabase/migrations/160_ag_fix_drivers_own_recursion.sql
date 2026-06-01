-- Migration 160: Fix ag_drivers_own causing infinite recursion
-- Cadena: ag_users → ag_users_trip_participants → ag_drivers (directo) → ag_drivers_own → ag_users → loop
-- ag_drivers_own tenía: ag_user_id IN (SELECT ag_users.id FROM ag_users WHERE auth_user_id = auth.uid())
-- Eso dispara RLS de ag_users desde dentro de ag_drivers, cerrando el ciclo.
-- Solución: usar ag_current_user_id() SECURITY DEFINER que bypasea RLS al resolver el ID.

DROP POLICY IF EXISTS "ag_drivers_own" ON ag_drivers;
CREATE POLICY "ag_drivers_own" ON ag_drivers FOR ALL
  USING (ag_user_id = ag_current_user_id());
