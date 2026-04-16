-- Detalles de los usuarios afectados: saldo actual, retiros, estado de paquete
SELECT
  p.username,
  p.real_balance,
  p.total_earned,
  p.has_active_package,
  p.role,
  p.package_expires_at::text,
  (SELECT COUNT(*) FROM withdrawal_requests wr WHERE wr.user_id = p.id AND wr.status = 'approved') AS approved_withdrawals,
  (SELECT COALESCE(SUM(wr.amount), 0) FROM withdrawal_requests wr WHERE wr.user_id = p.id AND wr.status = 'approved') AS total_withdrawn,
  (SELECT COUNT(*) FROM withdrawal_requests wr WHERE wr.user_id = p.id AND wr.status = 'pending') AS pending_withdrawals,
  (SELECT COALESCE(SUM(wr.amount), 0) FROM withdrawal_requests wr WHERE wr.user_id = p.id AND wr.status = 'pending') AS pending_amount
FROM profiles p
WHERE p.id IN (
  'bf523689-cde5-47c9-9314-be13ca228be1',
  'e0576969-446a-4e90-a35b-3c0a0337cef6',
  '4a06b515-a78e-490d-9000-14bdc136007f',
  '9435d36a-3661-40b3-93f0-f3a9481cb213'
)
ORDER BY p.real_balance DESC;
