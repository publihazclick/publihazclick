-- =============================================================================
-- Migration 031: Fix mini_referral reward in record_ptc_click
-- Problem: mini_referral tasks reuse ptc_tasks with ad_type='mini', so the RPC
-- treats them as regular mini ads (wrong reward, shared daily limit, dedup conflict).
-- Solution: Add p_ad_type_override param so the frontend can signal 'mini_referral'.
-- =============================================================================

DROP FUNCTION IF EXISTS record_ptc_click(UUID, UUID, VARCHAR, TEXT, VARCHAR, INTEGER);

CREATE OR REPLACE FUNCTION record_ptc_click(
  p_user_id UUID,
  p_task_id UUID,
  p_ip_address VARCHAR DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_session_fingerprint VARCHAR DEFAULT NULL,
  p_click_duration_ms INTEGER DEFAULT NULL,
  p_ad_type_override VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_task          ptc_tasks%ROWTYPE;
  v_already_done  INT;
  v_daily_count   INT;
  v_daily_limit   INT;
  v_reward        NUMERIC;
  v_today_col     DATE;
  v_effective_type VARCHAR;
  DONATION_PER_AD CONSTANT NUMERIC := 10.00;
BEGIN
  v_today_col := (NOW() AT TIME ZONE 'America/Bogota')::date;

  -- 1. Verificar que el anuncio existe y esta activo
  SELECT * INTO v_task FROM ptc_tasks WHERE id = p_task_id AND status = 'active';
  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Anuncio no disponible');
  END IF;

  -- Determine effective ad type (mini_referral overrides underlying mini type)
  v_effective_type := COALESCE(p_ad_type_override, v_task.ad_type::text);

  -- 2. Dedup: for mini_referral check daily_task_assignments instead of ptc_clicks
  IF v_effective_type = 'mini_referral' THEN
    -- Check if already completed in daily_task_assignments
    SELECT COUNT(*) INTO v_already_done
    FROM daily_task_assignments
    WHERE user_id = p_user_id
      AND task_id = p_task_id
      AND assignment_date = v_today_col
      AND ad_type = 'mini_referral'
      AND is_completed = true;

    IF v_already_done > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya viste este anuncio hoy');
    END IF;

    -- Verify this task was actually assigned as mini_referral to this user
    SELECT COUNT(*) INTO v_already_done
    FROM daily_task_assignments
    WHERE user_id = p_user_id
      AND task_id = p_task_id
      AND assignment_date = v_today_col
      AND ad_type = 'mini_referral';

    IF v_already_done = 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Este anuncio no esta asignado como mini referral');
    END IF;
  ELSE
    -- Regular dedup for non-mini_referral types
    SELECT COUNT(*) INTO v_already_done
    FROM ptc_clicks
    WHERE user_id = p_user_id
      AND task_id = p_task_id
      AND (completed_at AT TIME ZONE 'America/Bogota')::date = v_today_col;
    IF v_already_done > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Ya viste este anuncio hoy');
    END IF;
  END IF;

  -- 3. Daily limits by effective type
  v_daily_limit := CASE v_effective_type
    WHEN 'standard_400'  THEN 5
    WHEN 'mini'          THEN 4
    WHEN 'standard_600'  THEN 3
    WHEN 'mega'          THEN 1
    WHEN 'mini_referral' THEN 200  -- high limit; real limit is controlled by assignment slots
    ELSE 5
  END;

  -- 4. Count today's clicks for this effective type
  IF v_effective_type = 'mini_referral' THEN
    -- Count mini_referral completions from daily_task_assignments
    SELECT COUNT(*) INTO v_daily_count
    FROM daily_task_assignments
    WHERE user_id = p_user_id
      AND assignment_date = v_today_col
      AND ad_type = 'mini_referral'
      AND is_completed = true;
  ELSE
    SELECT COUNT(*) INTO v_daily_count
    FROM ptc_clicks pc
    JOIN ptc_tasks pt ON pt.id = pc.task_id
    WHERE pc.user_id = p_user_id
      AND pt.ad_type = v_task.ad_type
      AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_today_col;
  END IF;

  IF v_daily_count >= v_daily_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Limite diario de anuncios de este tipo alcanzado');
  END IF;

  -- 5. Reward by effective type
  v_reward := CASE v_effective_type
    WHEN 'standard_400'  THEN 400.00
    WHEN 'mini'          THEN 83.33
    WHEN 'standard_600'  THEN 600.00
    WHEN 'mega'          THEN 2000.00
    WHEN 'mini_referral' THEN 100.00
    ELSE 83.33
  END;

  -- 6. Insert click with metadata
  INSERT INTO ptc_clicks (user_id, task_id, reward_earned, ip_address, user_agent, session_fingerprint, click_duration_ms)
  VALUES (p_user_id, p_task_id, v_reward, p_ip_address, p_user_agent, p_session_fingerprint, p_click_duration_ms);

  -- 7. Increment task click counter
  UPDATE ptc_tasks SET total_clicks = total_clicks + 1 WHERE id = p_task_id;

  -- 8. Mark daily assignment as completed
  UPDATE daily_task_assignments SET is_completed = true, completed_at = NOW()
  WHERE user_id = p_user_id AND task_id = p_task_id
    AND assignment_date = v_today_col AND NOT is_completed;

  -- 9. Credit reward
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
    RETURN jsonb_build_object('success', true, 'reward', v_reward,
      'donation', DONATION_PER_AD, 'ad_type', v_effective_type, 'is_donation', true);
  ELSE
    UPDATE profiles
    SET real_balance = real_balance + v_reward,
        total_earned = total_earned + v_reward,
        updated_at   = NOW()
    WHERE id = p_user_id;
    RETURN jsonb_build_object('success', true, 'reward', v_reward,
      'donation', 0, 'ad_type', v_effective_type, 'is_donation', false);
  END IF;
END;
$$;

-- Grant permissions for the new signature
GRANT EXECUTE ON FUNCTION record_ptc_click(UUID, UUID, VARCHAR, TEXT, VARCHAR, INTEGER, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION record_ptc_click(UUID, UUID, VARCHAR, TEXT, VARCHAR, INTEGER, VARCHAR) TO anon;
