-- Analytics Movi: RPCs para dashboard admin
CREATE OR REPLACE FUNCTION public.ag_admin_stats(p_days INT DEFAULT 30)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  WITH reqs AS (
    SELECT id, status, created_at, offered_price, passenger_user_id, driver_id
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
  sos AS (SELECT COUNT(*) AS n FROM public.ag_sos_events WHERE created_at >= now() - (p_days || ' days')::interval)
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
    'days', p_days
  );
$$;

CREATE OR REPLACE FUNCTION public.ag_admin_daily_series(p_days INT DEFAULT 30)
RETURNS TABLE (day DATE, trips BIGINT, gmv BIGINT) LANGUAGE sql SECURITY DEFINER AS $$
  WITH days AS (
    SELECT generate_series(current_date - (p_days - 1), current_date, '1 day'::interval)::date AS day
  ),
  data AS (
    SELECT created_at::date AS day, COUNT(*)::bigint AS trips, COALESCE(SUM(offered_price), 0)::bigint AS gmv
    FROM public.ag_trip_requests WHERE status = 'completed' AND created_at >= current_date - (p_days - 1)
    GROUP BY 1
  )
  SELECT d.day, COALESCE(x.trips, 0), COALESCE(x.gmv, 0) FROM days d LEFT JOIN data x ON x.day = d.day ORDER BY d.day;
$$;
