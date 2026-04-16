-- Descontar ganancias ilegítimas calculando desde ptc_clicks
DO $$
DECLARE
  v_illegit NUMERIC;
  rec RECORD;
BEGIN
  -- 08diamante: paquete expiró 2026-03-28 20:00:17 UTC
  SELECT COALESCE(SUM(reward_earned), 0) INTO v_illegit
  FROM ptc_clicks WHERE user_id = 'bf523689-cde5-47c9-9314-be13ca228be1'
    AND completed_at > '2026-03-28 20:00:17.652737+00'::timestamptz;
  UPDATE profiles
  SET real_balance = GREATEST(0, real_balance - v_illegit),
      total_earned = GREATEST(0, total_earned - v_illegit), updated_at = NOW()
  WHERE id = 'bf523689-cde5-47c9-9314-be13ca228be1';
  INSERT INTO activity_logs (user_id, action, details, created_at) VALUES (
    'bf523689-cde5-47c9-9314-be13ca228be1', 'balance_correction',
    jsonb_build_object('reason','Clicks post-expiración','amount_deducted',v_illegit), NOW());

  -- tigerr: paquete expiró 2026-04-01 17:22:25 UTC
  SELECT COALESCE(SUM(reward_earned), 0) INTO v_illegit
  FROM ptc_clicks WHERE user_id = 'e0576969-446a-4e90-a35b-3c0a0337cef6'
    AND completed_at > '2026-04-01 17:22:25.371195+00'::timestamptz;
  UPDATE profiles
  SET real_balance = GREATEST(0, real_balance - v_illegit),
      total_earned = GREATEST(0, total_earned - v_illegit), updated_at = NOW()
  WHERE id = 'e0576969-446a-4e90-a35b-3c0a0337cef6';
  INSERT INTO activity_logs (user_id, action, details, created_at) VALUES (
    'e0576969-446a-4e90-a35b-3c0a0337cef6', 'balance_correction',
    jsonb_build_object('reason','Clicks post-expiración','amount_deducted',v_illegit), NOW());

  -- angel2430: paquete expiró 2026-04-02 00:06:52 UTC
  SELECT COALESCE(SUM(reward_earned), 0) INTO v_illegit
  FROM ptc_clicks WHERE user_id = '4a06b515-a78e-490d-9000-14bdc136007f'
    AND completed_at > '2026-04-02 00:06:52.880929+00'::timestamptz;
  UPDATE profiles
  SET real_balance = GREATEST(0, real_balance - v_illegit),
      total_earned = GREATEST(0, total_earned - v_illegit), updated_at = NOW()
  WHERE id = '4a06b515-a78e-490d-9000-14bdc136007f';
  INSERT INTO activity_logs (user_id, action, details, created_at) VALUES (
    '4a06b515-a78e-490d-9000-14bdc136007f', 'balance_correction',
    jsonb_build_object('reason','Clicks post-expiración','amount_deducted',v_illegit), NOW());

  -- luna: paquete expiró 2026-04-11 02:55:27 UTC
  SELECT COALESCE(SUM(reward_earned), 0) INTO v_illegit
  FROM ptc_clicks WHERE user_id = '9435d36a-3661-40b3-93f0-f3a9481cb213'
    AND completed_at > '2026-04-11 02:55:27.788762+00'::timestamptz;
  UPDATE profiles
  SET real_balance = GREATEST(0, real_balance - v_illegit),
      total_earned = GREATEST(0, total_earned - v_illegit), updated_at = NOW()
  WHERE id = '9435d36a-3661-40b3-93f0-f3a9481cb213';
  INSERT INTO activity_logs (user_id, action, details, created_at) VALUES (
    '9435d36a-3661-40b3-93f0-f3a9481cb213', 'balance_correction',
    jsonb_build_object('reason','Clicks post-expiración','amount_deducted',v_illegit), NOW());
END;
$$;

-- Verificar resultado final
SELECT p.username, p.real_balance, p.total_earned, p.has_active_package, p.role
FROM profiles p
WHERE p.id IN (
  'bf523689-cde5-47c9-9314-be13ca228be1',
  'e0576969-446a-4e90-a35b-3c0a0337cef6',
  '4a06b515-a78e-490d-9000-14bdc136007f',
  '9435d36a-3661-40b3-93f0-f3a9481cb213'
)
ORDER BY p.username;
