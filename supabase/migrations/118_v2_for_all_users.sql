-- =============================================================================
-- Migration 118: Aplicar modelo V2 a TODOS los usuarios (viejos y nuevos)
-- Fecha: 2026-04-18
--
-- CAMBIOS:
-- 1. grant_referral_mega_rewards: quitar el check v_buyer_created < V2_CUTOFF
--    para que aplique a referidos viejos también, en cualquier compra/renovacion
--    a partir de hoy.
-- 2. renew_package_with_balance: agregar PERFORM grant_referral_mega_rewards()
--    para que las renovaciones con saldo también otorguen grants al referidor.
--
-- Esto NO afecta pagos pasados (ya fueron procesados). Solo aplica desde el
-- momento de la migracion en adelante: cada compra nueva o renovacion
-- generara grants V2 al referidor sin importar la fecha de registro del
-- comprador.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. grant_referral_mega_rewards SIN restriccion de fecha de registro
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION grant_referral_mega_rewards(
  p_buyer_id   UUID,
  p_payment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_referrer_id     UUID;
  v_referrer_active BOOLEAN;
  v_active_refs     INT;
  v_frozen_refs     INT;
  v_rewards         JSONB;
  v_item            JSONB;
  v_total_granted   INT := 0;
  v_is_first        BOOLEAN;
BEGIN
  -- 1. Obtener referidor del comprador
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = p_buyer_id;
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_referrer');
  END IF;

  -- 2. Verificar que el referidor tiene paquete activo
  SELECT has_active_package INTO v_referrer_active FROM profiles WHERE id = v_referrer_id;
  IF NOT COALESCE(v_referrer_active, false) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'referrer_no_active_package');
  END IF;

  -- 3. Verificar si ya hubo un grant anterior para este par referidor+invitado
  SELECT frozen_active_refs INTO v_frozen_refs
  FROM referral_mega_grants
  WHERE referrer_id = v_referrer_id AND referred_id = p_buyer_id
    AND frozen_active_refs IS NOT NULL
  ORDER BY granted_at ASC
  LIMIT 1;

  v_is_first := (v_frozen_refs IS NULL);

  IF v_is_first THEN
    SELECT COUNT(*)::INT INTO v_active_refs
    FROM profiles
    WHERE referred_by = v_referrer_id
      AND has_active_package = true
      AND id != p_buyer_id;

    v_frozen_refs := v_active_refs;
  END IF;

  -- 4. Obtener recompensas según la categoría congelada
  v_rewards := get_referral_v2_rewards(v_frozen_refs);

  -- 5. Insertar los grants con el conteo congelado
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_rewards)
  LOOP
    INSERT INTO referral_mega_grants (
      referrer_id, referred_id, payment_id,
      ad_type, quantity, remaining, reward_per_ad,
      frozen_active_refs,
      granted_at, expires_at
    ) VALUES (
      v_referrer_id, p_buyer_id, p_payment_id,
      v_item->>'ad_type',
      (v_item->>'quantity')::INT,
      (v_item->>'quantity')::INT,
      (v_item->>'reward')::NUMERIC,
      v_frozen_refs,
      NOW(),
      NOW() + INTERVAL '30 days'
    );
    v_total_granted := v_total_granted + (v_item->>'quantity')::INT;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'frozen_refs', v_frozen_refs,
    'is_first_purchase', v_is_first,
    'total_ads_granted', v_total_granted,
    'rewards', v_rewards
  );
END;
$$;

GRANT EXECUTE ON FUNCTION grant_referral_mega_rewards(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. renew_package_with_balance ahora llama a grant_referral_mega_rewards
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION renew_package_with_balance(
  p_user_id UUID,
  p_package_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pkg            RECORD;
  v_profile        RECORD;
  v_price_cop      NUMERIC;
  v_end_date       TIMESTAMPTZ;
  v_up_id          UUID;
  v_was_renewing   BOOLEAN := false;
BEGIN
  SELECT id, real_balance, has_active_package, current_package_id
    INTO v_profile
    FROM profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuario no encontrado');
  END IF;

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

  v_price_cop := COALESCE(v_pkg.price_cop, ROUND(v_pkg.price * 4200));

  IF v_profile.real_balance < v_price_cop THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Saldo insuficiente. Necesitas ' || v_price_cop || ' COP, tienes ' || v_profile.real_balance || ' COP'
    );
  END IF;

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

  UPDATE profiles
     SET real_balance       = real_balance - v_price_cop,
         total_spent        = COALESCE(total_spent, 0) + v_price_cop,
         has_active_package = true,
         current_package_id = p_package_id,
         package_started_at = NOW(),
         package_expires_at = v_end_date,
         role               = 'advertiser'
   WHERE id = p_user_id;

  INSERT INTO user_packages (user_id, package_id, package_name, start_date, end_date, status, payment_method, amount_paid)
  VALUES (p_user_id, p_package_id, v_pkg.name, NOW(), v_end_date, 'active', 'balance', v_price_cop)
  RETURNING id INTO v_up_id;

  UPDATE user_packages
     SET status = 'expired', updated_at = NOW()
   WHERE user_id = p_user_id
     AND id != v_up_id
     AND status = 'active';

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

  -- V2: Otorgar mega ads al referidor (aplica a TODOS los usuarios desde 2026-04-18)
  PERFORM grant_referral_mega_rewards(p_user_id, NULL);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_profile.real_balance - v_price_cop,
    'package_name', v_pkg.name,
    'expires_at', v_end_date,
    'amount_charged', v_price_cop
  );
END;
$$;

GRANT EXECUTE ON FUNCTION renew_package_with_balance(UUID, UUID) TO authenticated;

-- =============================================================================
-- FIN Migration 118
-- =============================================================================
