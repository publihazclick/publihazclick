SELECT
  username,
  package_started_at::text,
  package_expires_at::text,
  EXTRACT(EPOCH FROM (package_expires_at - NOW())) / 86400 AS dias_exactos_restantes,
  CEIL(EXTRACT(EPOCH FROM (package_expires_at - NOW())) / 86400) AS dias_redondeados,
  EXTRACT(EPOCH FROM (package_expires_at - package_started_at)) / 86400 AS duracion_total_dias
FROM profiles
WHERE has_active_package = true
ORDER BY package_expires_at;
