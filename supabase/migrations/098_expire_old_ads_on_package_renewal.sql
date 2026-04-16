-- ============================================================================
-- 098: Pausar anuncios PTC/banner anteriores al activar/renovar un paquete
-- ----------------------------------------------------------------------------
-- Caso real: un usuario activa o renueva su paquete después de un período de
-- inactividad. Sus PTC/banners viejos quedan en estado 'active' aunque su
-- paquete haya expirado. Cuando el admin lo reactiva, esos anuncios viejos
-- consumen los slots del nuevo paquete y el gate de la migración 094 los
-- bloquea de hacer clicks (porque el gate exige PTC+banner del ciclo actual).
--
-- Este parche modifica las dos funciones que ponen un paquete en activo
-- (`activate_user_package` y `renew_package_with_balance`) para que pausen
-- automáticamente los anuncios anteriores al inicio del nuevo ciclo.
-- ============================================================================

-- 1) activate_user_package — usado por el panel admin
CREATE OR REPLACE FUNCTION activate_user_package(
  p_user_id UUID,
  p_package_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_package    RECORD;
  v_end_date   TIMESTAMPTZ;
  v_start_date TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_package FROM packages WHERE id = p_package_id;
  IF v_package.id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_end_date := v_start_date + (v_package.duration_days || ' days')::INTERVAL;

  -- Marcar paquetes anteriores como expirados
  UPDATE user_packages SET status = 'expired', updated_at = NOW()
  WHERE user_id = p_user_id AND status = 'active';

  -- Insertar nuevo paquete
  INSERT INTO user_packages (user_id, package_id, package_name, start_date, end_date, status)
  VALUES (p_user_id, p_package_id, v_package.name, v_start_date, v_end_date, 'active');

  -- Actualizar perfil: paquete activo + rol advertiser + saldo en cero
  UPDATE profiles
  SET
    has_active_package = TRUE,
    current_package_id = p_package_id,
    package_started_at = v_start_date,
    package_expires_at = v_end_date,
    role               = 'advertiser',
    real_balance       = 0,
    total_earned       = 0,
    updated_at         = NOW()
  WHERE id = p_user_id;

  -- Pausar PTC tasks y banner ads creados ANTES del nuevo ciclo,
  -- para que liberen slots y el usuario pueda crear los del ciclo actual.
  UPDATE ptc_tasks
     SET status = 'paused', updated_at = NOW()
   WHERE advertiser_id = p_user_id
     AND status = 'active'
     AND created_at < v_start_date;

  UPDATE banner_ads
     SET status = 'paused', updated_at = NOW()
   WHERE advertiser_id = p_user_id
     AND status = 'active'
     AND created_at < v_start_date;

  -- Log de la acción
  INSERT INTO activity_logs (user_id, action, details, created_at)
  VALUES (
    p_user_id,
    'admin_package_activation',
    jsonb_build_object(
      'reason', 'Activación manual desde admin — saldo reseteado a 0, anuncios viejos pausados',
      'package_id', p_package_id,
      'package_name', v_package.name,
      'expires_at', v_end_date
    ),
    NOW()
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2) renew_package_with_balance — usado por el botón "RENOVAR CON SALDO"
CREATE OR REPLACE FUNCTION renew_package_with_balance(
  p_user_id    UUID,
  p_package_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pkg            RECORD;
  v_profile        RECORD;
  v_price_cop      NUMERIC;
  v_end_date       TIMESTAMPTZ;
  v_up_id          UUID;
  v_was_renewing   BOOLEAN := false;
BEGIN
  -- 1. Obtener perfil con lock para evitar race conditions
  SELECT id, real_balance, has_active_package, current_package_id
    INTO v_profile
    FROM profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

  -- 2. Obtener paquete
  SELECT id, name, price, duration_days, is_active, price_cop
    INTO v_pkg
    FROM packages
   WHERE id = p_package_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paquete no encontrado');
  END IF;

  IF NOT v_pkg.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paquete no disponible');
  END IF;

  -- 3. Calcular precio en COP (usar price_cop si existe, sino USD × 4200)
  v_price_cop := COALESCE(v_pkg.price_cop, ROUND(v_pkg.price * 4200));

  -- 4. Validar saldo suficiente
  IF v_profile.real_balance < v_price_cop THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Saldo insuficiente. Necesitas ' || v_price_cop || ' COP, tienes ' || v_profile.real_balance || ' COP'
    );
  END IF;

  -- 5. Calcular fecha de expiración
  IF v_profile.has_active_package AND v_profile.current_package_id = p_package_id THEN
    v_was_renewing := true;
    SELECT end_date INTO v_end_date
      FROM user_packages
     WHERE user_id = p_user_id AND package_id = p_package_id AND status = 'active'
     ORDER BY end_date DESC LIMIT 1;

    IF v_end_date IS NOT NULL AND v_end_date > NOW() THEN
      v_end_date := v_end_date + (v_pkg.duration_days || ' days')::INTERVAL;
    ELSE
      v_end_date := NOW() + (v_pkg.duration_days || ' days')::INTERVAL;
    END IF;
  ELSE
    v_end_date := NOW() + (v_pkg.duration_days || ' days')::INTERVAL;
  END IF;

  -- 6. Descontar saldo (atómico)
  UPDATE profiles
     SET real_balance       = real_balance - v_price_cop,
         total_spent        = COALESCE(total_spent, 0) + v_price_cop,
         has_active_package = true,
         current_package_id = p_package_id,
         package_started_at = NOW(),
         package_expires_at = v_end_date,
         role               = 'advertiser'
   WHERE id = p_user_id;

  -- 7. Crear registro en user_packages
  INSERT INTO user_packages (user_id, package_id, package_name, start_date, end_date, status, payment_method, amount_paid)
  VALUES (p_user_id, p_package_id, v_pkg.name, NOW(), v_end_date, 'active', 'balance', v_price_cop)
  RETURNING id INTO v_up_id;

  -- 8. Marcar paquetes anteriores del mismo usuario como expirados
  UPDATE user_packages
     SET status = 'expired', updated_at = NOW()
   WHERE user_id = p_user_id
     AND id != v_up_id
     AND status = 'active';

  -- 9. Pausar anuncios anteriores SOLO si NO está renovando el mismo paquete
  --    en el mismo ciclo (para preservar los anuncios actuales del usuario).
  --    Si v_was_renewing es true (renovación normal del mismo paquete activo),
  --    no tocamos sus anuncios — son del ciclo en curso.
  IF NOT v_was_renewing THEN
    UPDATE ptc_tasks
       SET status = 'paused', updated_at = NOW()
     WHERE advertiser_id = p_user_id
       AND status = 'active'
       AND created_at < NOW() - INTERVAL '1 minute';

    UPDATE banner_ads
       SET status = 'paused', updated_at = NOW()
     WHERE advertiser_id = p_user_id
       AND status = 'active'
       AND created_at < NOW() - INTERVAL '1 minute';
  END IF;

  -- 10. Registrar en payments para auditoría
  INSERT INTO payments (
    user_id, package_id, package_name, amount_in_cents, currency, status,
    payment_method, gateway, gateway_transaction_id
  )
  VALUES (
    p_user_id, p_package_id, v_pkg.name,
    (v_price_cop * 100)::BIGINT,
    'COP', 'approved', 'balance', 'internal',
    'BALANCE-' || v_up_id::TEXT
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_profile.real_balance - v_price_cop,
    'package_name', v_pkg.name,
    'expires_at', v_end_date,
    'amount_charged', v_price_cop
  );
END;
$$;
