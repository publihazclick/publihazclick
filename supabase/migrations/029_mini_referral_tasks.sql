-- =============================================================================
-- Migration 029: Mini Anuncios por Invitar (mini_referral)
-- Reutiliza contenido de mini ads pero paga 100 COP al invitador.
-- Slots diarios = afiliados_activos × slots_por_nivel (básica: 1/2/3/4)
-- El RPC record_ptc_click ya acredita cualquier tipo no-standard_400
-- a real_balance, por lo que mini_referral funciona sin cambios en él.
-- =============================================================================

-- 1. Función auxiliar: slots por afiliado según nivel básico
-- =============================================================================
CREATE OR REPLACE FUNCTION get_mini_referral_slots_per_affiliate(p_affiliate_count INT)
RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF    p_affiliate_count BETWEEN 1  AND 2  THEN RETURN 1;
  ELSIF p_affiliate_count BETWEEN 3  AND 5  THEN RETURN 2;
  ELSIF p_affiliate_count BETWEEN 6  AND 9  THEN RETURN 3;
  ELSIF p_affiliate_count BETWEEN 10 AND 19 THEN RETURN 4;
  ELSIF p_affiliate_count >= 20              THEN RETURN 5; -- categorías superiores (TBD)
  ELSE RETURN 0;
  END IF;
END;
$$;

-- 2. RPC: Asignar mini_referral tasks al usuario para hoy
-- Crea registros en daily_task_assignments usando mini ads como contenido
-- pero con ad_type='mini_referral' y reward=100 COP.
-- =============================================================================
CREATE OR REPLACE FUNCTION assign_mini_referral_tasks(
  p_user_id UUID,
  p_date    DATE DEFAULT (NOW() AT TIME ZONE 'America/Bogota')::date
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_affiliate_count      INT;
  v_slots_per_affiliate  INT;
  v_total_slots          INT;
  v_already_assigned     INT;
  v_to_assign            INT;
  v_task_id              UUID;
  v_assigned             INT := 0;
BEGIN
  -- Contar afiliados activos del usuario
  SELECT COUNT(*) INTO v_affiliate_count
  FROM profiles
  WHERE referred_by = p_user_id AND has_active_package = true;

  IF v_affiliate_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'assigned', 0, 'reason', 'no_affiliates');
  END IF;

  v_slots_per_affiliate := get_mini_referral_slots_per_affiliate(v_affiliate_count);
  v_total_slots         := v_affiliate_count * v_slots_per_affiliate;

  -- Cuántos ya están asignados hoy para este usuario como mini_referral
  SELECT COUNT(*) INTO v_already_assigned
  FROM daily_task_assignments
  WHERE user_id       = p_user_id
    AND assignment_date = p_date
    AND ad_type       = 'mini_referral';

  v_to_assign := v_total_slots - v_already_assigned;

  IF v_to_assign <= 0 THEN
    RETURN jsonb_build_object('success', true, 'assigned', 0, 'reason', 'already_full',
      'total_slots', v_total_slots);
  END IF;

  -- Asignar mini tasks activas no asignadas aún a este usuario hoy
  -- (evita conflicto con el UNIQUE constraint user_id+task_id+date)
  FOR v_task_id IN (
    SELECT t.id
    FROM ptc_tasks t
    WHERE t.ad_type = 'mini'
      AND t.status  = 'active'
      AND t.id NOT IN (
        SELECT task_id
        FROM daily_task_assignments
        WHERE user_id = p_user_id AND assignment_date = p_date
      )
    ORDER BY RANDOM()
    LIMIT v_to_assign
  ) LOOP
    INSERT INTO daily_task_assignments (user_id, task_id, assignment_date, ad_type, reward)
    VALUES (p_user_id, v_task_id, p_date, 'mini_referral', 100)
    ON CONFLICT (user_id, task_id, assignment_date) DO NOTHING;
    v_assigned := v_assigned + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success',             true,
    'assigned',            v_assigned,
    'total_slots',         v_total_slots,
    'already_assigned',    v_already_assigned,
    'affiliates',          v_affiliate_count,
    'slots_per_affiliate', v_slots_per_affiliate
  );
END;
$$;

-- 3. RPC: Obtener mini_referral tasks de hoy para un usuario
-- =============================================================================
CREATE OR REPLACE FUNCTION get_mini_referral_tasks_today(
  p_user_id UUID,
  p_date    DATE DEFAULT (NOW() AT TIME ZONE 'America/Bogota')::date
)
RETURNS TABLE (
  assignment_id UUID,
  task_id       UUID,
  title         TEXT,
  description   TEXT,
  image_url     TEXT,
  youtube_url   TEXT,
  url           TEXT,
  reward        NUMERIC,
  is_completed  BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    dta.id            AS assignment_id,
    dta.task_id,
    t.title,
    t.description,
    t.image_url,
    t.youtube_url,
    t.url,
    dta.reward,
    dta.is_completed
  FROM daily_task_assignments dta
  JOIN ptc_tasks t ON t.id = dta.task_id
  WHERE dta.user_id         = p_user_id
    AND dta.assignment_date = p_date
    AND dta.ad_type         = 'mini_referral'
  ORDER BY dta.created_at;
END;
$$;

-- 4. Grants
GRANT EXECUTE ON FUNCTION assign_mini_referral_tasks(UUID, DATE)     TO authenticated;
GRANT EXECUTE ON FUNCTION get_mini_referral_tasks_today(UUID, DATE)  TO authenticated;
GRANT EXECUTE ON FUNCTION get_mini_referral_slots_per_affiliate(INT) TO authenticated;
