-- Migration 097: Fix renew_package_with_balance — columna inexistente "amount"
-- ============================================================================
-- La migración 070 referenciaba payments.amount, pero la columna real es
-- amount_in_cents (BIGINT, en centavos COP). Esto rompía el botón
-- "RENOVAR CON SALDO" en /dashboard/packages.
-- Recreamos la función SQL idéntica salvo el INSERT corregido.
-- ============================================================================

CREATE OR REPLACE FUNCTION renew_package_with_balance(
  p_user_id    UUID,
  p_package_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pkg        RECORD;
  v_profile    RECORD;
  v_price_cop  NUMERIC;
  v_end_date   TIMESTAMPTZ;
  v_up_id      UUID;
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

  -- 9. Registrar en payments para auditoría (FIX: amount_in_cents en lugar de amount)
  INSERT INTO payments (
    user_id,
    package_id,
    package_name,
    amount_in_cents,
    currency,
    status,
    payment_method,
    gateway,
    gateway_transaction_id
  )
  VALUES (
    p_user_id,
    p_package_id,
    v_pkg.name,
    (v_price_cop * 100)::BIGINT,  -- payments.amount_in_cents está en centavos
    'COP',
    'approved',
    'balance',
    'internal',
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
