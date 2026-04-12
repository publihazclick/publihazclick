-- ============================================================================
-- 094: Gate PTC clicks until user creates PTC ad + banner after each activation
--
-- Aplicable solo a paquetes activados o renovados desde 2026-04-11 en adelante.
-- Los usuarios con package_started_at anterior a esa fecha NO son afectados.
--
-- 1. get_user_ad_limits devuelve flags gate_active, has_ptc_ad, has_banner_ad
--    y devuelve limites en 0 cuando el gate esta activo y no se ha cumplido
-- 2. record_ptc_click rechaza el click si el gate esta activo y no se cumplio
-- ============================================================================

-- Fecha desde la cual aplica la regla (America/Bogota)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_ad_limits(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_active_refs INT;
  v_today DATE;
  v_month_start DATE;
  v_std400_limit INT;
  v_mini_limit INT;
  v_std600_limit INT;
  v_mega_monthly_limit INT;
  v_mega_used_month INT;
  v_mega_remaining INT;
  v_mini_ref_slots INT;
  v_std400_done INT;
  v_mini_done INT;
  v_std600_done INT;
  v_mini_ref_done INT;
  v_has_package BOOLEAN;
  v_pkg_started TIMESTAMPTZ;
  v_gate_active BOOLEAN := false;
  v_has_ptc_ad BOOLEAN := false;
  v_has_banner_ad BOOLEAN := false;
  AD_GATE_CUTOFF CONSTANT TIMESTAMPTZ := '2026-04-11T00:00:00-05:00';
BEGIN
  v_today := (NOW() AT TIME ZONE 'America/Bogota')::date;
  v_month_start := date_trunc('month', v_today)::date;

  -- Verificar paquete activo
  SELECT has_active_package, package_started_at
    INTO v_has_package, v_pkg_started
  FROM profiles WHERE id = p_user_id;

  IF NOT COALESCE(v_has_package, false) THEN
    RETURN jsonb_build_object(
      'has_package', false,
      'gate_active', false,
      'has_ptc_ad', false,
      'has_banner_ad', false,
      'standard_400', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'mini', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'standard_600', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'mega', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'mini_referral', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0)
    );
  END IF;

  -- Gate: solo si el paquete fue activado/renovado desde el cutoff
  IF v_pkg_started IS NOT NULL AND v_pkg_started >= AD_GATE_CUTOFF THEN
    SELECT EXISTS (
      SELECT 1 FROM ptc_tasks
      WHERE advertiser_id = p_user_id
        AND created_at >= v_pkg_started
    ) INTO v_has_ptc_ad;

    SELECT EXISTS (
      SELECT 1 FROM banner_ads
      WHERE advertiser_id = p_user_id
        AND created_at >= v_pkg_started
    ) INTO v_has_banner_ad;

    IF NOT v_has_ptc_ad OR NOT v_has_banner_ad THEN
      v_gate_active := true;
    END IF;
  END IF;

  -- Si el gate esta activo, devolver limites en 0 (pero has_package = true)
  IF v_gate_active THEN
    RETURN jsonb_build_object(
      'has_package', true,
      'gate_active', true,
      'has_ptc_ad', v_has_ptc_ad,
      'has_banner_ad', v_has_banner_ad,
      'standard_400', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'mini', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'standard_600', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'mega', jsonb_build_object('monthly_limit', 0, 'used_month', 0, 'remaining', 0),
      'mini_referral', jsonb_build_object('total_slots', 0, 'done', 0, 'remaining', 0)
    );
  END IF;

  -- Contar referidos activos
  SELECT COUNT(*)::INT INTO v_active_refs
  FROM profiles
  WHERE referred_by = p_user_id AND has_active_package = true;

  -- Limites diarios
  v_std400_limit := CASE WHEN v_active_refs >= 20 THEN 15 ELSE 5 END;
  v_mini_limit := 4;
  v_std600_limit := 3;

  -- Mega: mensual
  v_mega_monthly_limit := v_active_refs * 5;
  SELECT COUNT(*)::INT INTO v_mega_used_month
  FROM ptc_clicks pc
  JOIN ptc_tasks pt ON pt.id = pc.task_id
  WHERE pc.user_id = p_user_id
    AND pt.ad_type = 'mega'
    AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date >= v_month_start;
  v_mega_remaining := GREATEST(v_mega_monthly_limit - v_mega_used_month, 0);

  -- Mini referral: basado en categoria
  v_mini_ref_slots := v_active_refs * get_mini_referral_slots_per_affiliate(v_active_refs);

  -- Clicks hechos hoy por tipo
  SELECT COUNT(*)::INT INTO v_std400_done
  FROM ptc_clicks pc JOIN ptc_tasks pt ON pt.id = pc.task_id
  WHERE pc.user_id = p_user_id AND pt.ad_type = 'standard_400'
    AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_today;

  SELECT COUNT(*)::INT INTO v_mini_done
  FROM ptc_clicks pc JOIN ptc_tasks pt ON pt.id = pc.task_id
  WHERE pc.user_id = p_user_id AND pt.ad_type = 'mini'
    AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_today;

  SELECT COUNT(*)::INT INTO v_std600_done
  FROM ptc_clicks pc JOIN ptc_tasks pt ON pt.id = pc.task_id
  WHERE pc.user_id = p_user_id AND pt.ad_type = 'standard_600'
    AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_today;

  SELECT COUNT(*)::INT INTO v_mini_ref_done
  FROM daily_task_assignments
  WHERE user_id = p_user_id AND assignment_date = v_today
    AND ad_type = 'mini_referral' AND is_completed = true;

  RETURN jsonb_build_object(
    'has_package', true,
    'gate_active', false,
    'has_ptc_ad', true,
    'has_banner_ad', true,
    'active_refs', v_active_refs,
    'standard_400', jsonb_build_object('limit', v_std400_limit, 'done', v_std400_done, 'remaining', GREATEST(v_std400_limit - v_std400_done, 0)),
    'mini', jsonb_build_object('limit', v_mini_limit, 'done', v_mini_done, 'remaining', GREATEST(v_mini_limit - v_mini_done, 0)),
    'standard_600', jsonb_build_object('limit', v_std600_limit, 'done', v_std600_done, 'remaining', GREATEST(v_std600_limit - v_std600_done, 0)),
    'mega', jsonb_build_object('monthly_limit', v_mega_monthly_limit, 'used_month', v_mega_used_month, 'remaining', v_mega_remaining),
    'mini_referral', jsonb_build_object('total_slots', v_mini_ref_slots, 'done', v_mini_ref_done, 'remaining', GREATEST(v_mini_ref_slots - v_mini_ref_done, 0))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_ad_limits(UUID) TO authenticated;

-- ── Helper: check gate for a user (true = bloqueado) ─────────────────────────
CREATE OR REPLACE FUNCTION user_ad_creation_gate_blocks(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_pkg_started TIMESTAMPTZ;
  v_has_ptc BOOLEAN;
  v_has_banner BOOLEAN;
  AD_GATE_CUTOFF CONSTANT TIMESTAMPTZ := '2026-04-11T00:00:00-05:00';
BEGIN
  SELECT package_started_at INTO v_pkg_started
  FROM profiles WHERE id = p_user_id;

  IF v_pkg_started IS NULL OR v_pkg_started < AD_GATE_CUTOFF THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM ptc_tasks
    WHERE advertiser_id = p_user_id AND created_at >= v_pkg_started
  ) INTO v_has_ptc;

  SELECT EXISTS (
    SELECT 1 FROM banner_ads
    WHERE advertiser_id = p_user_id AND created_at >= v_pkg_started
  ) INTO v_has_banner;

  RETURN NOT (v_has_ptc AND v_has_banner);
END;
$$;

GRANT EXECUTE ON FUNCTION user_ad_creation_gate_blocks(UUID) TO authenticated;

-- ── Parche a record_ptc_click: validar gate antes de registrar click ─────────
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
  SELECT has_active_package, package_expires_at
  INTO v_has_package, v_pkg_expires
  FROM profiles WHERE id = p_user_id;

  IF NOT COALESCE(v_has_package, false) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Tu paquete ha expirado. Renueva tu paquete para seguir ganando.');
  END IF;

  IF v_pkg_expires IS NOT NULL AND v_pkg_expires <= NOW() THEN
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

  -- ══ GATE: debe haber creado anuncio PTC y banner en el periodo actual ════
  IF user_ad_creation_gate_blocks(p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Debes crear tu anuncio PTC y tu banner antes de hacer clicks en los anuncios.',
      'gate_active', true);
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
