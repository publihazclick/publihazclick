-- =============================================================================
-- Migration 051: Usuarios pueden ver sus propios clicks + RPC get_my_today_clicks
-- Objetivo: que el frontend pueda sincronizar el estado de anuncios vistos
-- desde la BD (fuente de verdad) en lugar de depender de localStorage/IP/caché.
-- =============================================================================

-- 1. Política RLS: usuarios autenticados pueden SELECT sus propios ptc_clicks
CREATE POLICY "Users can view own ptc_clicks"
  ON ptc_clicks FOR SELECT
  USING (user_id = auth.uid());

-- 2. RPC: retorna los task_ids que el usuario actual ya clickeó HOY (hora Colombia)
CREATE OR REPLACE FUNCTION get_my_today_clicks()
RETURNS TABLE(task_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pc.task_id
  FROM ptc_clicks pc
  WHERE pc.user_id = auth.uid()
    AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date
        = (NOW() AT TIME ZONE 'America/Bogota')::date;
$$;

GRANT EXECUTE ON FUNCTION get_my_today_clicks() TO authenticated;
