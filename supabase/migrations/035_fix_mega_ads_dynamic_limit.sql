-- =============================================================================
-- Migration 035: Mega ads — límite dinámico basado en afiliados activos
-- Antes: mega → 1 (hardcodeado)
-- Ahora: mega → 5 × afiliados_activos, máximo 200 (40 afiliados × 5)
-- =============================================================================

CREATE OR REPLACE FUNCTION record_ptc_click(
  p_user_id UUID,
  p_task_id UUID,
  p_ip_address VARCHAR DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_fingerprint VARCHAR DEFAULT NULL,
  p_click_duration_ms INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_task              ptc_tasks%ROWTYPE;
  v_already_done      INT;
  v_daily_count       INT;
  v_daily_limit       INT;
  v_reward            NUMERIC;
  v_today_col         DATE;
  v_active_affiliates INT;
  DONATION_PER_AD CONSTANT NUMERIC := 10.00;
BEGIN
  -- Fecha de hoy en zona horaria Colombia (UTC-5, sin DST)
  v_today_col := (NOW() AT TIME ZONE 'America/Bogota')::date;

  -- 1. Verificar que el anuncio existe y está activo
  SELECT * INTO v_task FROM ptc_tasks WHERE id = p_task_id AND status = 'active';
  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Anuncio no disponible');
  END IF;

  -- 2. Dedup: ya clickeó este anuncio hoy (según hora Colombia)
  SELECT COUNT(*) INTO v_already_done
  FROM ptc_clicks
  WHERE user_id = p_user_id
    AND task_id = p_task_id
    AND (completed_at AT TIME ZONE 'America/Bogota')::date = v_today_col;
  IF v_already_done > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya viste este anuncio hoy');
  END IF;

  -- 3. Límite diario por tipo de anuncio
  IF v_task.ad_type = 'mega' THEN
    -- Mega: 5 slots por cada afiliado activo, máximo 40 afiliados (200 mega ads/día)
    SELECT LEAST(COUNT(*) * 5, 200)::INT INTO v_daily_limit
    FROM profiles
    WHERE referred_by = p_user_id
      AND has_active_package = true;

    IF v_daily_limit = 0 THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Necesitas afiliados activos para desbloquear mega anuncios');
    END IF;
  ELSE
    v_daily_limit := CASE v_task.ad_type
      WHEN 'standard_400' THEN 5
      WHEN 'mini'         THEN 4
      WHEN 'standard_600' THEN 3
      WHEN 'mini_referral' THEN 999  -- controlado por assign_mini_referral_tasks
      ELSE 5
    END;
  END IF;

  -- 4. Cuántos de este tipo ha visto hoy (hora Colombia)
  SELECT COUNT(*) INTO v_daily_count
  FROM ptc_clicks pc
  JOIN ptc_tasks  pt ON pt.id = pc.task_id
  WHERE pc.user_id = p_user_id
    AND pt.ad_type = v_task.ad_type
    AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_today_col;

  IF v_daily_count >= v_daily_limit THEN
    RETURN jsonb_build_object('success', false, 'error',
      'Límite diario de anuncios de este tipo alcanzado');
  END IF;

  -- 5. Recompensa fija por tipo
  v_reward := CASE v_task.ad_type
    WHEN 'standard_400'  THEN 400.00
    WHEN 'mini'          THEN 83.33
    WHEN 'standard_600'  THEN 600.00
    WHEN 'mega'          THEN 2000.00
    WHEN 'mini_referral' THEN 100.00
    ELSE 83.33
  END;

  -- 6. Insertar click con metadata anti-fraude
  INSERT INTO ptc_clicks (user_id, task_id, reward_earned, ip_address, user_agent, session_fingerprint, click_duration_ms)
  VALUES (p_user_id, p_task_id, v_reward, p_ip_address, p_user_agent, p_session_fingerprint, p_click_duration_ms);

  -- 7. Incrementar total_clicks en ptc_tasks
  UPDATE ptc_tasks SET total_clicks = total_clicks + 1 WHERE id = p_task_id;

  -- 8. Marcar asignación diaria como completada si existe (legacy)
  UPDATE daily_task_assignments SET is_completed = true, completed_at = NOW()
  WHERE user_id = p_user_id AND task_id = p_task_id
    AND assignment_date = v_today_col AND NOT is_completed;

  -- 9. Acreditar según tipo
  IF v_task.ad_type = 'standard_400' THEN
    UPDATE profiles
    SET real_balance  = real_balance  + v_reward,
        total_earned  = total_earned  + v_reward,
        total_donated = total_donated + DONATION_PER_AD,
        updated_at    = NOW()
    WHERE id = p_user_id;
    INSERT INTO donations (user_id, amount, source, source_id, description)
    VALUES (p_user_id, DONATION_PER_AD, 'ptc_click', p_task_id,
            'Donación por ver anuncio: ' || COALESCE(v_task.title, 'Anuncio PTC'));
    RETURN jsonb_build_object('success', true, 'reward', v_reward,
      'donation', DONATION_PER_AD, 'ad_type', v_task.ad_type, 'is_donation', true);
  ELSE
    UPDATE profiles
    SET real_balance = real_balance + v_reward,
        total_earned = total_earned + v_reward,
        updated_at   = NOW()
    WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true, 'reward', v_reward,
      'donation', 0, 'ad_type', v_task.ad_type, 'is_donation', false);
  END IF;
END;
$$;

-- Garantizar permisos
GRANT EXECUTE ON FUNCTION record_ptc_click(UUID, UUID, VARCHAR, TEXT, VARCHAR, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION record_ptc_click(UUID, UUID, VARCHAR, TEXT, VARCHAR, INTEGER) TO anon;
