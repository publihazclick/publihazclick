-- ============================================================================
-- 090: Fix clicks after package expiry
--
-- 1. Add package validation to record_ptc_click (reject if package expired)
-- 2. Expire all overdue packages immediately
-- 3. Deduct illegitimate earnings from affected users
-- ============================================================================

-- ── 1. Ejecutar expire_user_packages para desactivar paquetes vencidos ──────
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT up.id AS up_id, up.user_id
    FROM user_packages up
    WHERE up.status = 'active'
      AND up.end_date <= NOW()
  LOOP
    UPDATE profiles
    SET has_active_package = false,
        current_package_id = NULL,
        package_expires_at = NULL,
        package_started_at = NULL,
        role = 'guest',
        updated_at = NOW()
    WHERE id = rec.user_id;

    DELETE FROM user_packages WHERE id = rec.up_id;
  END LOOP;
END;
$$;

-- ── 2. Descontar ganancias ilegítimas de los usuarios afectados ─────────────
-- Calcula cuánto ganaron DESPUÉS de que su paquete expiró y lo resta del saldo
DO $$
DECLARE
  rec RECORD;
  v_illegit NUMERIC;
BEGIN
  FOR rec IN
    SELECT
      ep.user_id,
      ep.end_date AS package_end_date,
      COALESCE(SUM(pc.reward_earned), 0) AS illegit_total
    FROM (
      SELECT up.user_id, up.end_date
      FROM user_packages up WHERE up.status = 'expired'
      UNION ALL
      -- También incluir los que acabamos de expirar (ya borrados, buscar en ptc_clicks)
      SELECT p.id, p.package_expires_at
      FROM profiles p
      WHERE p.has_active_package = false
        AND p.package_expires_at IS NOT NULL
    ) ep
    JOIN ptc_clicks pc ON pc.user_id = ep.user_id
      AND pc.completed_at > ep.end_date
    GROUP BY ep.user_id, ep.end_date
    HAVING SUM(pc.reward_earned) > 0
  LOOP
    -- Descontar del saldo real (sin dejarlo negativo)
    UPDATE profiles
    SET real_balance = GREATEST(0, real_balance - rec.illegit_total),
        total_earned = GREATEST(0, total_earned - rec.illegit_total),
        updated_at = NOW()
    WHERE id = rec.user_id;

    -- Registrar la corrección en activity_logs
    INSERT INTO activity_logs (user_id, action, details, created_at)
    VALUES (
      rec.user_id,
      'balance_correction',
      jsonb_build_object(
        'reason', 'Clicks realizados después de expiración de paquete',
        'amount_deducted', rec.illegit_total,
        'package_end_date', rec.package_end_date
      ),
      NOW()
    );
  END LOOP;
END;
$$;

-- ── 3. Parchear record_ptc_click para validar paquete activo ────────────────
CREATE OR REPLACE FUNCTION record_ptc_click(
  p_user_id             UUID,
  p_task_id             UUID,
  p_ip_address          TEXT    DEFAULT NULL,
  p_user_agent          TEXT    DEFAULT NULL,
  p_session_fingerprint TEXT    DEFAULT NULL,
  p_click_duration_ms   INTEGER DEFAULT NULL,
  p_ad_type_override    TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_task            ptc_tasks%ROWTYPE;
  v_already_done    INT;
  v_daily_count     INT;
  v_monthly_count   INT;
  v_daily_limit     INT;
  v_reward          NUMERIC;
  v_today_col       DATE;
  v_month_start     DATE;
  v_effective_type  TEXT;
  v_referrer_id     UUID;
  v_referral_bonus  NUMERIC;
  v_std400_limit    INT;
  v_mega_limit      INT;
  v_ancestor_id     UUID;
  v_depth           INT;
  v_dc_level        INT;
  v_depth_bonus     NUMERIC;
  v_depth_bonuses   NUMERIC[] := ARRAY[20, 19, 18, 17, 16];
  v_user_created    TIMESTAMPTZ;
  v_is_new_referral BOOLEAN := false;
  v_has_package     BOOLEAN;
  v_pkg_expires     TIMESTAMPTZ;
  DONATION_PER_AD   CONSTANT NUMERIC := 10.00;
  V2_CUTOFF         CONSTANT TIMESTAMPTZ := '2026-04-10T00:00:00-05:00';
BEGIN
  v_today_col := (NOW() AT TIME ZONE 'America/Bogota')::date;
  v_month_start := date_trunc('month', v_today_col)::date;

  -- ══ VALIDACIÓN DE PAQUETE ACTIVO ══════════════════════════════════════════
  -- Verificar que el usuario tiene un paquete activo Y que no ha expirado
  SELECT has_active_package, package_expires_at
  INTO v_has_package, v_pkg_expires
  FROM profiles WHERE id = p_user_id;

  IF NOT COALESCE(v_has_package, false) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Tu paquete ha expirado. Renueva tu paquete para seguir ganando.');
  END IF;

  -- Doble check: aunque has_active_package sea true, verificar fecha real
  IF v_pkg_expires IS NOT NULL AND v_pkg_expires <= NOW() THEN
    -- Expirar el paquete en tiempo real (el cron no lo hizo aún)
    UPDATE profiles
    SET has_active_package = false,
        current_package_id = NULL,
        package_expires_at = NULL,
        package_started_at = NULL,
        role = 'guest',
        updated_at = NOW()
    WHERE id = p_user_id;

    DELETE FROM user_packages
    WHERE user_id = p_user_id AND status = 'active';

    RETURN jsonb_build_object('success', false, 'error',
      'Tu paquete ha expirado. Renueva tu paquete para seguir ganando.');
  END IF;
  -- ══════════════════════════════════════════════════════════════════════════

  -- 1. Verificar anuncio activo
  SELECT * INTO v_task FROM ptc_tasks WHERE id = p_task_id AND status = 'active';
  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Anuncio no disponible');
  END IF;

  v_effective_type := COALESCE(p_ad_type_override, v_task.ad_type::text);

  -- ── Mega V2: consumir grant en vez de usar el sistema viejo ──
  IF v_effective_type IN ('mega_2000','mega_5000','mega_10000','mega_20000','mega_50000','mega_100000') THEN
    DECLARE
      v_consume JSONB;
    BEGIN
      v_consume := consume_referral_mega_grant(p_user_id, v_effective_type);
      IF (v_consume->>'success')::boolean THEN
        INSERT INTO ptc_clicks (
          user_id, task_id, reward_earned,
          ip_address, user_agent, session_fingerprint, click_duration_ms
        ) VALUES (
          p_user_id, p_task_id, (v_consume->>'reward')::NUMERIC,
          p_ip_address, p_user_agent, p_session_fingerprint, p_click_duration_ms
        );
        UPDATE ptc_tasks SET total_clicks = total_clicks + 1 WHERE id = p_task_id;

        RETURN jsonb_build_object(
          'success', true,
          'reward', (v_consume->>'reward')::NUMERIC,
          'donation', 0,
          'ad_type', v_effective_type,
          'is_donation', false,
          'remaining', (v_consume->>'remaining_in_grant')::INT
        );
      ELSE
        RETURN jsonb_build_object('success', false, 'error', v_consume->>'error');
      END IF;
    END;
  END IF;

  -- 2. Dedup diario
  IF v_effective_type = 'mini_referral' THEN
    SELECT COUNT(*) INTO v_already_done
    FROM daily_task_assignments
    WHERE user_id = p_user_id AND task_id = p_task_id
      AND assignment_date = v_today_col AND ad_type = 'mini_referral' AND is_completed = true;
    IF v_already_done > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya viste este anuncio hoy');
    END IF;
    SELECT COUNT(*) INTO v_already_done
    FROM daily_task_assignments
    WHERE user_id = p_user_id AND task_id = p_task_id
      AND assignment_date = v_today_col AND ad_type = 'mini_referral';
    IF v_already_done = 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Este anuncio no esta asignado como mini referral');
    END IF;
  ELSE
    SELECT COUNT(*) INTO v_already_done
    FROM ptc_clicks
    WHERE user_id = p_user_id AND task_id = p_task_id
      AND (completed_at AT TIME ZONE 'America/Bogota')::date = v_today_col;
    IF v_already_done > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya viste este anuncio hoy');
    END IF;
  END IF;

  -- 3. Calcular limites segun tipo de anuncio
  IF v_effective_type = 'mega' THEN
    SELECT COUNT(*)::INT INTO v_mega_limit
    FROM profiles
    WHERE referred_by = p_user_id
      AND has_active_package = true;
    v_mega_limit := v_mega_limit * 5;

    IF v_mega_limit = 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Necesitas afiliados activos para desbloquear mega anuncios');
    END IF;

    SELECT COUNT(*) INTO v_monthly_count
    FROM ptc_clicks pc
    JOIN ptc_tasks pt ON pt.id = pc.task_id
    WHERE pc.user_id = p_user_id
      AND pt.ad_type = 'mega'
      AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date >= v_month_start;

    IF v_monthly_count >= v_mega_limit THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Limite mensual de mega anuncios alcanzado (' || v_mega_limit || ' por mes)');
    END IF;

    v_daily_limit := 999;

  ELSIF v_effective_type = 'standard_400' THEN
    SELECT CASE WHEN COUNT(*) >= 20 THEN 15 ELSE 5 END::INT INTO v_std400_limit
    FROM profiles
    WHERE referred_by = p_user_id AND has_active_package = true;
    v_daily_limit := v_std400_limit;

  ELSIF v_effective_type = 'mini_referral' THEN
    v_daily_limit := 200;
  ELSE
    v_daily_limit := CASE v_effective_type
      WHEN 'mini'         THEN 4
      WHEN 'standard_600' THEN 3
      ELSE 5
    END;
  END IF;

  -- 4. Verificar limite diario (excepto mega que ya se verifico mensual)
  IF v_effective_type != 'mega' THEN
    IF v_effective_type = 'mini_referral' THEN
      SELECT COUNT(*) INTO v_daily_count
      FROM daily_task_assignments
      WHERE user_id = p_user_id AND assignment_date = v_today_col
        AND ad_type = 'mini_referral' AND is_completed = true;
    ELSE
      SELECT COUNT(*) INTO v_daily_count
      FROM ptc_clicks pc
      JOIN ptc_tasks pt ON pt.id = pc.task_id
      WHERE pc.user_id = p_user_id
        AND pt.ad_type = v_task.ad_type
        AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_today_col;
    END IF;

    IF v_daily_count >= v_daily_limit THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Limite diario de anuncios de este tipo alcanzado');
    END IF;
  END IF;

  -- 5. Recompensa
  v_reward := CASE v_effective_type
    WHEN 'standard_400'  THEN 400.00
    WHEN 'mini'          THEN 83.33
    WHEN 'standard_600'  THEN 600.00
    WHEN 'mega'          THEN 2000.00
    WHEN 'mini_referral' THEN 100.00
    ELSE 83.33
  END;

  -- 6. Registrar click
  INSERT INTO ptc_clicks (
    user_id, task_id, reward_earned,
    ip_address, user_agent, session_fingerprint, click_duration_ms
  ) VALUES (
    p_user_id, p_task_id, v_reward,
    p_ip_address, p_user_agent, p_session_fingerprint, p_click_duration_ms
  );

  UPDATE ptc_tasks SET total_clicks = total_clicks + 1 WHERE id = p_task_id;

  UPDATE daily_task_assignments SET is_completed = true, completed_at = NOW()
  WHERE user_id = p_user_id AND task_id = p_task_id
    AND assignment_date = v_today_col AND NOT is_completed;

  -- 7. Acreditar y pagar bonuses
  IF v_effective_type = 'standard_400' THEN
    UPDATE profiles
    SET real_balance  = real_balance  + v_reward,
        total_earned  = total_earned  + v_reward,
        total_donated = total_donated + DONATION_PER_AD,
        updated_at    = NOW()
    WHERE id = p_user_id;

    INSERT INTO donations (user_id, amount, source, source_id, description)
    VALUES (p_user_id, DONATION_PER_AD, 'ptc_click', p_task_id,
            'Donacion por ver anuncio: ' || COALESCE(v_task.title, 'Anuncio PTC'));

    -- Bonus nivel 1 al referidor directo
    SELECT referred_by, created_at INTO v_referrer_id, v_user_created
    FROM profiles WHERE id = p_user_id;

    IF v_user_created >= V2_CUTOFF THEN
      v_is_new_referral := true;
    END IF;

    IF v_referrer_id IS NOT NULL AND NOT v_is_new_referral THEN
      v_referral_bonus := get_referral_click_bonus(v_referrer_id);
      IF v_referral_bonus > 0 THEN
        UPDATE profiles
        SET real_balance = real_balance + v_referral_bonus,
            total_earned = total_earned + v_referral_bonus,
            updated_at   = NOW()
        WHERE id = v_referrer_id;
      END IF;

      -- Bonos de profundidad Diamante Corona DC1-DC5
      v_ancestor_id := v_referrer_id;
      FOR v_depth IN 2..6 LOOP
        SELECT referred_by INTO v_ancestor_id FROM profiles WHERE id = v_ancestor_id;
        EXIT WHEN v_ancestor_id IS NULL;

        v_dc_level := get_dc_level(v_ancestor_id);

        IF v_dc_level >= (v_depth - 1) THEN
          v_depth_bonus := v_depth_bonuses[v_depth - 1];
          UPDATE profiles
          SET real_balance = real_balance + v_depth_bonus,
              total_earned = total_earned + v_depth_bonus,
              updated_at   = NOW()
          WHERE id = v_ancestor_id;
        END IF;
      END LOOP;
    ELSE
      v_referral_bonus := 0;
    END IF;

    RETURN jsonb_build_object(
      'success', true, 'reward', v_reward,
      'donation', DONATION_PER_AD, 'ad_type', v_effective_type, 'is_donation', true,
      'referral_bonus', COALESCE(v_referral_bonus, 0)
    );
  ELSE
    UPDATE profiles
    SET real_balance = real_balance + v_reward,
        total_earned = total_earned + v_reward,
        updated_at   = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'success', true, 'reward', v_reward,
      'donation', 0, 'ad_type', v_effective_type, 'is_donation', false
    );
  END IF;
END;
$$;
