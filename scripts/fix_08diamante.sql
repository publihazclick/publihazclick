DO $$
DECLARE
  v_user_id UUID := 'bf523689-cde5-47c9-9314-be13ca228be1';
  v_pkg_id  UUID := 'e9481131-34fc-49f9-85d3-3cfe32f6ebd1';
  v_start   TIMESTAMPTZ := NOW();
  v_end     TIMESTAMPTZ := NOW() + INTERVAL '30 days';
  v_up_id   UUID;
BEGIN
  -- 1. Ajustar saldo a 275,266 COP
  UPDATE profiles
  SET real_balance       = 275266,
      total_earned       = 275266,
      has_active_package = true,
      current_package_id = v_pkg_id,
      package_started_at = v_start,
      package_expires_at = v_end,
      role               = 'advertiser',
      updated_at         = NOW()
  WHERE id = v_user_id;

  -- 2. Crear registro en user_packages
  INSERT INTO user_packages (user_id, package_id, start_date, end_date, status)
  VALUES (v_user_id, v_pkg_id, v_start, v_end, 'active')
  RETURNING id INTO v_up_id;

  -- 3. Log de la acción
  INSERT INTO activity_logs (user_id, action, details, created_at)
  VALUES (
    v_user_id,
    'admin_package_activation',
    jsonb_build_object(
      'reason', 'Ajuste manual: saldo corregido a 275266 COP, paquete Básico activado por 30 días',
      'package_id', v_pkg_id,
      'user_package_id', v_up_id,
      'balance_set', 275266,
      'expires_at', v_end
    ),
    NOW()
  );
END;
$$;

-- Verificar
SELECT username, real_balance, total_earned, has_active_package, role,
       package_started_at::text, package_expires_at::text, current_package_id
FROM profiles
WHERE id = 'bf523689-cde5-47c9-9314-be13ca228be1';
