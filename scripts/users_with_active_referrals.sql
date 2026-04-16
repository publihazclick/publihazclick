SELECT
  p.username,
  p.has_active_package,
  p.role,
  COUNT(r.id) AS referidos_activos
FROM profiles p
JOIN profiles r ON r.referred_by = p.id AND r.has_active_package = true
GROUP BY p.id, p.username, p.has_active_package, p.role
ORDER BY referidos_activos DESC;
