SELECT
  invitador.username AS invitador,
  invitador.has_active_package AS invitador_activo,
  invitado.username AS invitado,
  invitado.has_active_package AS paquete_activo_ahora,
  invitado.role,
  invitado.package_expires_at::text,
  invitado.real_balance,
  invitado.created_at::date AS registro,
  CASE
    WHEN invitado.has_active_package THEN 'ACTIVO'
    WHEN EXISTS (
      SELECT 1 FROM ptc_clicks pc WHERE pc.user_id = invitado.id LIMIT 1
    ) THEN 'EXPIRADO'
    WHEN invitado.total_earned > 0 THEN 'EXPIRADO'
    ELSE 'NUNCA ACTIVÓ'
  END AS estado_historico,
  invitado.total_earned AS total_ganado_historico
FROM profiles invitador
JOIN profiles invitado ON invitado.referred_by = invitador.id
WHERE EXISTS (
  SELECT 1 FROM profiles r WHERE r.referred_by = invitador.id
)
ORDER BY invitador.username,
  CASE
    WHEN invitado.has_active_package THEN 1
    WHEN EXISTS (SELECT 1 FROM ptc_clicks pc WHERE pc.user_id = invitado.id LIMIT 1) THEN 2
    WHEN invitado.total_earned > 0 THEN 2
    ELSE 3
  END,
  invitado.username;
