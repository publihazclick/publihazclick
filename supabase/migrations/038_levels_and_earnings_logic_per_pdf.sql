-- =============================================================================
-- Migration 038: Lógica de ganancias y niveles según documento oficial PDF
--
-- Niveles según invitados activos:
--   JADE          0–2   bonus/click=$100  mini_slots=1  std400_limit=5
--   PERLA         3–5   bonus/click=$200  mini_slots=2  std400_limit=5
--   ZAFIRO        6–9   bonus/click=$300  mini_slots=3  std400_limit=5
--   RUBY         10–19  bonus/click=$400  mini_slots=4  std400_limit=5
--   ESMERALDA    20–25  bonus/click=$400  mini_slots=5  std400_limit=15
--   DIAMANTE     26–30  bonus/click=$400  mini_slots=5  std400_limit=15
--   DIAMANTE AZUL 31–35 bonus/click=$400  mini_slots=5  std400_limit=15
--   DIAMANTE NEGRO 36–39 bonus/click=$400 mini_slots=5  std400_limit=15
--   DIAMANTE CORONA 40+ bonus/click=$400  mini_slots=5  std400_limit=15
--
-- Mega ads: 5 × invitados_activos (sin límite superior)
-- =============================================================================

-- ── 1. Función: nivel/categoría del usuario ──────────────────────────────────
CREATE OR REPLACE FUNCTION get_user_level(p_user_id UUID)
RETURNS TABLE (
  affiliate_count INT,
  level_name      TEXT,
  referral_bonus  NUMERIC,
  mini_slots      INT,
  std400_limit    INT,
  mega_limit      INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*)::INT INTO v_count
  FROM profiles
  WHERE referred_by = p_user_id AND has_active_package = true;

  RETURN QUERY SELECT
    v_count,
    CASE
      WHEN v_count BETWEEN 0  AND 2  THEN 'jade'
      WHEN v_count BETWEEN 3  AND 5  THEN 'perla'
      WHEN v_count BETWEEN 6  AND 9  THEN 'zafiro'
      WHEN v_count BETWEEN 10 AND 19 THEN 'ruby'
      WHEN v_count BETWEEN 20 AND 25 THEN 'esmeralda'
      WHEN v_count BETWEEN 26 AND 30 THEN 'diamante'
      WHEN v_count BETWEEN 31 AND 35 THEN 'diamante_azul'
      WHEN v_count BETWEEN 36 AND 39 THEN 'diamante_negro'
      ELSE                                 'diamante_corona'
    END,
    CASE
      WHEN v_count BETWEEN 1  AND 2  THEN 100.00
      WHEN v_count BETWEEN 3  AND 5  THEN 200.00
      WHEN v_count BETWEEN 6  AND 9  THEN 300.00
      WHEN v_count >= 10             THEN 400.00
      ELSE 0.00
    END,
    get_mini_referral_slots_per_affiliate(v_count),
    CASE WHEN v_count >= 20 THEN 15 ELSE 5 END,
    v_count * 5;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_level(UUID) TO authenticated;

-- ── 2. Función: bonus por click según nivel del referidor ─────────────────────
CREATE OR REPLACE FUNCTION get_referral_click_bonus(p_referrer_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*)::INT INTO v_count
  FROM profiles
  WHERE referred_by = p_referrer_id AND has_active_package = true;

  RETURN CASE
    WHEN v_count BETWEEN 1  AND 2  THEN 100.00
    WHEN v_count BETWEEN 3  AND 5  THEN 200.00
    WHEN v_count BETWEEN 6  AND 9  THEN 300.00
    WHEN v_count >= 10             THEN 400.00
    ELSE 0.00
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_click_bonus(UUID) TO authenticated;

-- ── 3. get_mini_referral_slots_per_affiliate (consolidado) ───────────────────
CREATE OR REPLACE FUNCTION get_mini_referral_slots_per_affiliate(p_affiliate_count INT)
RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF    p_affiliate_count BETWEEN 1  AND 2  THEN RETURN 1;  -- JADE
  ELSIF p_affiliate_count BETWEEN 3  AND 5  THEN RETURN 2;  -- PERLA
  ELSIF p_affiliate_count BETWEEN 6  AND 9  THEN RETURN 3;  -- ZAFIRO
  ELSIF p_affiliate_count BETWEEN 10 AND 19 THEN RETURN 4;  -- RUBY
  ELSIF p_affiliate_count >= 20             THEN RETURN 5;  -- ESMERALDA+
  ELSE RETURN 0;
  END IF;
END;
$$;

-- ── 4. record_ptc_click con lógica de niveles completa ───────────────────────
DROP FUNCTION IF EXISTS record_ptc_click(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, TEXT);

CREATE FUNCTION record_ptc_click(
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
  v_daily_limit     INT;
  v_reward          NUMERIC;
  v_today_col       DATE;
  v_effective_type  TEXT;
  v_referrer_id     UUID;
  v_referral_bonus  NUMERIC;
  v_std400_limit    INT;
  v_mega_limit      INT;
  DONATION_PER_AD   CONSTANT NUMERIC := 10.00;
BEGIN
  v_today_col := (NOW() AT TIME ZONE 'America/Bogota')::date;

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
        'Este anuncio no está asignado como mini referral');
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

  -- 3. Calcular límites según nivel del usuario
  IF v_effective_type = 'mega' THEN
    -- Mega: 5 × afiliados_activos (sin límite superior)
    SELECT (COUNT(*) * 5)::INT INTO v_mega_limit
    FROM profiles
    WHERE referred_by = p_user_id AND has_active_package = true;
    IF v_mega_limit = 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Necesitas afiliados activos para desbloquear mega anuncios');
    END IF;
    v_daily_limit := v_mega_limit;

  ELSIF v_effective_type = 'standard_400' THEN
    -- Standard_400: 5/día base; 15/día con 20+ afiliados ($70k → $180k propios)
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

  -- 4. Verificar límite diario
  IF v_effective_type = 'mini_referral' THEN
    SELECT COUNT(*) INTO v_daily_count
    FROM daily_task_assignments
    WHERE user_id = p_user_id AND assignment_date = v_today_col
      AND ad_type = 'mini_referral' AND is_completed = true;
  ELSE
    SELECT COUNT(*) INTO v_daily_count
    FROM ptc_clicks pc
    JOIN ptc_tasks  pt ON pt.id = pc.task_id
    WHERE pc.user_id = p_user_id
      AND pt.ad_type = v_task.ad_type
      AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_today_col;
  END IF;

  IF v_daily_count >= v_daily_limit THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Límite diario de anuncios de este tipo alcanzado');
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

  -- 7. Acreditar y pagar bonus referido (nivel-dependiente)
  IF v_effective_type = 'standard_400' THEN
    UPDATE profiles
    SET real_balance  = real_balance  + v_reward,
        total_earned  = total_earned  + v_reward,
        total_donated = total_donated + DONATION_PER_AD,
        updated_at    = NOW()
    WHERE id = p_user_id;

    INSERT INTO donations (user_id, amount, source, source_id, description)
    VALUES (p_user_id, DONATION_PER_AD, 'ptc_click', p_task_id,
            'Donación por ver anuncio: ' || COALESCE(v_task.title, 'Anuncio PTC'));

    -- Bonus nivel 1 al referidor directo (depende de su nivel/categoría)
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
