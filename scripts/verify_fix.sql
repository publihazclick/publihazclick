-- Verificar estado de los 4 usuarios afectados después del fix
SELECT
  p.username,
  p.real_balance,
  p.total_earned,
  p.has_active_package,
  p.role,
  p.package_expires_at::text
FROM profiles p
WHERE p.id IN (
  'bf523689-cde5-47c9-9314-be13ca228be1',
  'e0576969-446a-4e90-a35b-3c0a0337cef6',
  '4a06b515-a78e-490d-9000-14bdc136007f',
  '9435d36a-3661-40b3-93f0-f3a9481cb213'
)
ORDER BY p.username;
