-- Referidos V2 (registrados desde el 10 abril 2026)
SELECT p.username, p.created_at::text, p.has_active_package,
  (SELECT username FROM profiles WHERE id = p.referred_by) AS invitador
FROM profiles p
WHERE p.created_at >= '2026-04-10T00:00:00-05:00'::timestamptz
  AND p.referred_by IS NOT NULL
ORDER BY p.created_at;
