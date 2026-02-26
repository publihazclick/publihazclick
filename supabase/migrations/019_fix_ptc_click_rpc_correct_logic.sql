-- =============================================================================
-- Migration 019: Corrección lógica RPC record_ptc_click
-- standard_400: 400 COP → billetera + 10 COP fijos → donaciones
-- mini/standard_600/mega: reward íntegro → billetera, sin donación
-- Máx donaciones/día: 5 ads × 10 COP = 50 COP
-- =============================================================================

CREATE OR REPLACE FUNCTION record_ptc_click(
  p_user_id UUID,
  p_task_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_assignment daily_task_assignments%ROWTYPE;
  v_task_title TEXT;
  DONATION_PER_AD CONSTANT NUMERIC := 10.00;
BEGIN
  -- Buscar asignación de hoy
  SELECT * INTO v_assignment
  FROM daily_task_assignments
  WHERE user_id         = p_user_id
    AND task_id         = p_task_id
    AND assignment_date = CURRENT_DATE
  LIMIT 1;

  IF v_assignment.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes esta tarea asignada hoy');
  END IF;

  IF v_assignment.is_completed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya completaste esta tarea hoy');
  END IF;

  SELECT title INTO v_task_title FROM ptc_tasks WHERE id = p_task_id;

  -- Marcar como completada
  UPDATE daily_task_assignments
  SET is_completed = true, completed_at = NOW()
  WHERE id = v_assignment.id;

  -- Registrar en ptc_clicks
  INSERT INTO ptc_clicks (user_id, task_id, reward_earned)
  VALUES (p_user_id, p_task_id, v_assignment.reward);

  -- Incrementar contador del anuncio
  UPDATE ptc_tasks SET total_clicks = total_clicks + 1 WHERE id = p_task_id;

  -- Acreditar según tipo
  IF v_assignment.ad_type = 'standard_400' THEN
    -- 400 COP → billetera + 10 COP fijos → donaciones
    UPDATE profiles
    SET real_balance  = real_balance  + v_assignment.reward,
        total_earned  = total_earned  + v_assignment.reward,
        total_donated = total_donated + DONATION_PER_AD,
        updated_at    = NOW()
    WHERE id = p_user_id;

    INSERT INTO donations (user_id, amount, source, source_id, description)
    VALUES (
      p_user_id,
      DONATION_PER_AD,
      'ptc_click',
      p_task_id,
      'Donación por ver anuncio: ' || COALESCE(v_task_title, 'Anuncio PTC')
    );

    RETURN jsonb_build_object(
      'success',     true,
      'reward',      v_assignment.reward,
      'donation',    DONATION_PER_AD,
      'ad_type',     v_assignment.ad_type,
      'is_donation', true
    );

  ELSE
    -- mini, standard_600, mega → billetera real, sin donación
    UPDATE profiles
    SET real_balance = real_balance + v_assignment.reward,
        total_earned = total_earned + v_assignment.reward,
        updated_at   = NOW()
    WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'success',     true,
      'reward',      v_assignment.reward,
      'donation',    0,
      'ad_type',     v_assignment.ad_type,
      'is_donation', false
    );
  END IF;
END;
$$;
