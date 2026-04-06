-- =============================================================================
-- 1. Helper: obtener nivel Diamante Corona de un usuario
-- Cuenta cuantos referidos directos tienen 40+ referidos activos
-- =============================================================================
CREATE OR REPLACE FUNCTION get_dc_level(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_dc_count INT;
BEGIN
  SELECT COUNT(*)::INT INTO v_dc_count
  FROM profiles direct_ref
  WHERE direct_ref.referred_by = p_user_id
    AND direct_ref.has_active_package = true
    AND (
      SELECT COUNT(*)
      FROM profiles sub_ref
      WHERE sub_ref.referred_by = direct_ref.id
        AND sub_ref.has_active_package = true
    ) >= 40;

  RETURN LEAST(v_dc_count, 5);
END;
$$;

GRANT EXECUTE ON FUNCTION get_dc_level(UUID) TO authenticated;

-- =============================================================================
-- 2. record_ptc_click con bonos de profundidad DC1-5
-- =============================================================================
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
  DONATION_PER_AD   CONSTANT NUMERIC := 10.00;
BEGIN
  v_today_col := (NOW() AT TIME ZONE 'America/Bogota')::date;
  v_month_start := date_trunc('month', v_today_col)::date;

  -- 1. Verificar anuncio activo
  SELECT * INTO v_task FROM ptc_tasks WHERE id = p_task_id AND status = 'active';
  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Anuncio no disponible');
  END IF;

  v_effective_type := COALESCE(p_ad_type_override, v_task.ad_type::text);

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
    SELECT (COUNT(*) * 5)::INT INTO v_mega_limit
    FROM profiles
    WHERE referred_by = p_user_id AND has_active_package = true;
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

    -- Bonus nivel 1 al referidor directo (Jade/Perla/Zafiro/Ruby/Esmeralda+)
    SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = p_user_id;
    IF v_referrer_id IS NOT NULL THEN
      v_referral_bonus := get_referral_click_bonus(v_referrer_id);
      IF v_referral_bonus > 0 THEN
        UPDATE profiles
        SET real_balance = real_balance + v_referral_bonus,
            total_earned = total_earned + v_referral_bonus,
            updated_at   = NOW()
        WHERE id = v_referrer_id;
      END IF;

      -- 8. Bonos de profundidad Diamante Corona DC1-DC5
      -- Recorrer ancestros desde nivel 2 hasta nivel 6
      -- DC1: ancestro nivel 2 recibe $20 por click
      -- DC2: ancestro nivel 3 recibe $19 por click
      -- DC3: ancestro nivel 4 recibe $18 por click
      -- DC4: ancestro nivel 5 recibe $17 por click
      -- DC5: ancestro nivel 6 recibe $16 por click
      v_ancestor_id := v_referrer_id;
      FOR v_depth IN 2..6 LOOP
        -- Subir un nivel en la cadena de referidos
        SELECT referred_by INTO v_ancestor_id FROM profiles WHERE id = v_ancestor_id;
        EXIT WHEN v_ancestor_id IS NULL;

        -- Verificar nivel DC del ancestro
        v_dc_level := get_dc_level(v_ancestor_id);

        -- DC1 desbloquea profundidad nivel 2, DC2 nivel 3, etc.
        -- Se necesita dc_level >= (depth - 1)
        IF v_dc_level >= (v_depth - 1) THEN
          v_depth_bonus := v_depth_bonuses[v_depth - 1];
          UPDATE profiles
          SET real_balance = real_balance + v_depth_bonus,
              total_earned = total_earned + v_depth_bonus,
              updated_at   = NOW()
          WHERE id = v_ancestor_id;
        END IF;
      END LOOP;
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

GRANT EXECUTE ON FUNCTION record_ptc_click(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION record_ptc_click(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO anon;
