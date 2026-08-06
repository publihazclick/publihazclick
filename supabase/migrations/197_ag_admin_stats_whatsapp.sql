-- ════════════════════════════════════════════════════════════
-- 197: Métricas del canal WhatsApp en ag_admin_stats
-- ════════════════════════════════════════════════════════════
-- Agrega, de forma aditiva (no rompe los campos existentes que ya
-- consume el panel admin), visibilidad del canal de solicitudes por
-- WhatsApp: cuántas sesiones arrancaron, cuántos viajes se crearon
-- desde ahí, cuántos se completaron y la tasa de conversión.

CREATE OR REPLACE FUNCTION public.ag_admin_stats(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH reqs AS (
    SELECT id, status, created_at, offered_price, passenger_user_id, driver_id, source
    FROM public.ag_trip_requests WHERE created_at >= now() - (p_days || ' days')::interval
  ),
  completed AS (
    SELECT COUNT(*) AS n, COALESCE(SUM(offered_price), 0) AS gmv FROM reqs WHERE status = 'completed'
  ),
  cancelled AS (SELECT COUNT(*) AS n FROM reqs WHERE status = 'cancelled'),
  active_drivers AS (SELECT COUNT(DISTINCT driver_id) AS n FROM reqs WHERE driver_id IS NOT NULL),
  unique_passengers AS (SELECT COUNT(DISTINCT passenger_user_id) AS n FROM reqs),
  new_drivers AS (SELECT COUNT(*) AS n FROM public.ag_drivers WHERE created_at >= now() - (p_days || ' days')::interval),
  new_passengers AS (SELECT COUNT(*) AS n FROM public.ag_users WHERE role = 'passenger' AND created_at >= now() - (p_days || ' days')::interval),
  sos AS (SELECT COUNT(*) AS n FROM public.ag_sos_events WHERE created_at >= now() - (p_days || ' days')::interval),
  wa_sessions AS (
    SELECT COUNT(*) AS n FROM public.ag_wa_sessions
    WHERE created_at >= now() - (p_days || ' days')::interval
  ),
  wa_reqs AS (SELECT * FROM reqs WHERE source = 'whatsapp'),
  wa_completed AS (SELECT COUNT(*) AS n FROM wa_reqs WHERE status = 'completed')
  SELECT jsonb_build_object(
    'completed_trips', (SELECT n FROM completed),
    'gmv_cop', (SELECT gmv FROM completed),
    'cancelled_trips', (SELECT n FROM cancelled),
    'completion_rate', CASE WHEN (SELECT COUNT(*) FROM reqs) = 0 THEN 0 ELSE ROUND((SELECT n FROM completed)::numeric * 100 / (SELECT COUNT(*) FROM reqs), 1) END,
    'active_drivers', (SELECT n FROM active_drivers),
    'unique_passengers', (SELECT n FROM unique_passengers),
    'new_drivers', (SELECT n FROM new_drivers),
    'new_passengers', (SELECT n FROM new_passengers),
    'sos_events', (SELECT n FROM sos),
    'wa_sessions', (SELECT n FROM wa_sessions),
    'wa_trip_requests', (SELECT COUNT(*) FROM wa_reqs),
    'wa_completed_trips', (SELECT n FROM wa_completed),
    'wa_conversion_rate', CASE WHEN (SELECT COUNT(*) FROM wa_reqs) = 0 THEN 0 ELSE ROUND((SELECT n FROM wa_completed)::numeric * 100 / (SELECT COUNT(*) FROM wa_reqs), 1) END,
    'days', p_days
  );
$function$
