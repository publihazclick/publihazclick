-- =============================================================================
-- Migration 086: Fix ad display — only show ads users can actually claim
--
-- 1. RPC get_my_month_mega_clicks: returns mega task_ids clicked this month
-- 2. Update get_user_ad_limits to also exclude already-clicked tasks
-- =============================================================================

-- 1. RPC: retorna los task_ids de mega clicks del mes actual
CREATE OR REPLACE FUNCTION get_my_month_mega_clicks()
RETURNS TABLE(task_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pc.task_id
  FROM ptc_clicks pc
  JOIN ptc_tasks pt ON pt.id = pc.task_id
  WHERE pc.user_id = auth.uid()
    AND pt.ad_type = 'mega'
    AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date
        >= date_trunc('month', (NOW() AT TIME ZONE 'America/Bogota')::date)::date;
$$;

GRANT EXECUTE ON FUNCTION get_my_month_mega_clicks() TO authenticated;
