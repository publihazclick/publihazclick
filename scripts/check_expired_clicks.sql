-- Buscar usuarios que hicieron clicks DESPUÉS de que su paquete expiró
WITH expired_packages AS (
  SELECT
    p.id AS user_id,
    p.username,
    up.end_date AS package_end_date,
    up.start_date AS package_start_date,
    up.status AS package_status,
    pk.name AS package_name
  FROM profiles p
  JOIN user_packages up ON up.user_id = p.id
  JOIN packages pk ON pk.id = up.package_id
  WHERE up.status = 'expired'
     OR up.end_date <= NOW()
)
SELECT
  ep.user_id,
  ep.username,
  ep.package_name,
  ep.package_end_date::text,
  COUNT(pc.id) AS clicks_after_expiry,
  ROUND(SUM(pc.reward_earned)::numeric, 2) AS total_earned_after_expiry,
  MIN(pc.completed_at)::text AS first_click_after,
  MAX(pc.completed_at)::text AS last_click_after
FROM expired_packages ep
JOIN ptc_clicks pc ON pc.user_id = ep.user_id
  AND pc.completed_at > ep.package_end_date
GROUP BY ep.user_id, ep.username, ep.package_name, ep.package_end_date
ORDER BY total_earned_after_expiry DESC
LIMIT 50;
