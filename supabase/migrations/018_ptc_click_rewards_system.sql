-- =============================================================================
-- Migration 018: Sistema de recompensas PTC correcto
-- Lógica: standard_400 → donaciones | mini/standard_600/mega → billetera real
-- =============================================================================

-- 1. CORREGIR REWARDS EN ptc_tasks (valores incorrectos en USD en vez de COP)
UPDATE ptc_tasks SET reward = 400.00  WHERE ad_type = 'standard_400' AND reward < 1;
UPDATE ptc_tasks SET reward = 83.33   WHERE ad_type = 'mini'         AND reward < 1;
UPDATE ptc_tasks SET reward = 2000.00 WHERE ad_type = 'mega'         AND reward < 100;
UPDATE ptc_tasks SET reward = 600.00  WHERE ad_type = 'standard_600' AND reward < 10;

-- 2. RPC: Registrar click PTC y acreditar saldo correctamente
-- Lógica de negocio:
--   - standard_400 (400 COP): va íntegro a DONACIONES (total_donated)
--   - mini (83.33 COP), standard_600 (600 COP), mega (2000 COP): van a BILLETERA REAL (real_balance)
--   - Máximo por día: 5 standard_400 + 4 mini (controlado por daily_task_assignments)
CREATE OR REPLACE FUNCTION record_ptc_click(
  p_user_id UUID,
  p_task_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_assignment daily_task_assignments%ROWTYPE;
  v_task_title TEXT;
BEGIN
  -- Buscar asignación de hoy
  SELECT * INTO v_assignment
  FROM daily_task_assignments
  WHERE user_id   = p_user_id
    AND task_id   = p_task_id
    AND assignment_date = CURRENT_DATE
  LIMIT 1;

  IF v_assignment.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes esta tarea asignada hoy');
  END IF;

  IF v_assignment.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya completaste esta tarea hoy');
  END IF;

  -- Título del anuncio para descripción de donación
  SELECT title INTO v_task_title FROM ptc_tasks WHERE id = p_task_id;

  -- Marcar asignación como completada
  UPDATE daily_task_assignments
  SET is_completed = true, completed_at = NOW()
  WHERE id = v_assignment.id;

  -- Registrar en ptc_clicks
  INSERT INTO ptc_clicks (user_id, task_id, reward_earned)
  VALUES (p_user_id, p_task_id, v_assignment.reward);

  -- Incrementar contador total del anuncio
  UPDATE ptc_tasks SET total_clicks = total_clicks + 1 WHERE id = p_task_id;

  -- Acreditar según tipo de anuncio
  IF v_assignment.ad_type = 'standard_400' THEN
    -- 400 COP → DONACIONES
    UPDATE profiles
    SET total_donated = total_donated + v_assignment.reward,
        updated_at    = NOW()
    WHERE id = p_user_id;

    INSERT INTO donations (user_id, amount, source, source_id, description)
    VALUES (
      p_user_id,
      v_assignment.reward,
      'ptc_click',
      p_task_id,
      'Donación por ver anuncio: ' || COALESCE(v_task_title, 'Anuncio PTC')
    );
  ELSE
    -- mini, standard_600, mega → BILLETERA REAL
    UPDATE profiles
    SET real_balance  = real_balance  + v_assignment.reward,
        total_earned  = total_earned  + v_assignment.reward,
        updated_at    = NOW()
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'reward',      v_assignment.reward,
    'ad_type',     v_assignment.ad_type,
    'is_donation', v_assignment.ad_type = 'standard_400'
  );
END;
$$;
