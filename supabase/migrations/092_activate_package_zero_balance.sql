-- ============================================================================
-- 092: Al activar paquete desde admin, poner saldo en cero
-- Esto aplica cuando el usuario pagó vía Nequi con saldo parcial
-- ============================================================================

CREATE OR REPLACE FUNCTION activate_user_package(
  p_user_id UUID,
  p_package_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_package RECORD;
  v_end_date TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_package FROM packages WHERE id = p_package_id;
  IF v_package.id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_end_date := NOW() + (v_package.duration_days || ' days')::INTERVAL;

  -- Marcar paquetes anteriores como expirados
  UPDATE user_packages SET status = 'expired', updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  -- Insertar nuevo paquete
  INSERT INTO user_packages (user_id, package_id, package_name, start_date, end_date, status)
  VALUES (p_user_id, p_package_id, v_package.name, NOW(), v_end_date, 'active');

  -- Actualizar perfil: paquete activo + rol advertiser + saldo en cero
  UPDATE profiles
  SET
    has_active_package = TRUE,
    current_package_id = p_package_id,
    package_started_at = NOW(),
    package_expires_at = v_end_date,
    role = 'advertiser',
    real_balance = 0,
    total_earned = 0,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Log de la acción
  INSERT INTO activity_logs (user_id, action, details, created_at)
  VALUES (
    p_user_id,
    'admin_package_activation',
    jsonb_build_object(
      'reason', 'Activación manual desde admin — saldo reseteado a 0',
      'package_id', p_package_id,
      'package_name', v_package.name,
      'expires_at', v_end_date
    ),
    NOW()
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
