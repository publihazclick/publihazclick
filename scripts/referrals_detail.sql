SELECT
  invitador.username AS invitador,
  invitado.username AS invitado,
  invitado.has_active_package AS activo,
  invitado.role,
  invitado.package_expires_at::text,
  invitado.real_balance,
  invitado.created_at::date AS registro
FROM profiles invitador
JOIN profiles invitado ON invitado.referred_by = invitador.id
WHERE invitador.id IN (
  SELECT p.id FROM profiles p
  JOIN profiles r ON r.referred_by = p.id
  GROUP BY p.id
)
ORDER BY invitador.username, invitado.has_active_package DESC, invitado.username;
