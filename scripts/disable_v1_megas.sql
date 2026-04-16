-- Quitar mega V1 automáticos de get_user_ad_limits
-- Después del corte V2 (2026-04-10), los megas solo vienen de referral_mega_grants
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
  v_mini_ref_slots INT;
  v_std400_done INT;
  v_mini_done INT;
  v_std600_done INT;
  v_mini_ref_done INT;
  v_has_package BOOLEAN;
BEGIN
  v_today := (NOW() AT TIME ZONE 'America/Bogota')::date;
  v_month_start := date_trunc('month', v_today)::date;

  -- Verificar paquete activo
  SELECT has_active_package INTO v_has_package
  FROM profiles WHERE id = p_user_id;

  IF NOT COALESCE(v_has_package, false) THEN
    RETURN jsonb_build_object(
      'has_package', false,
      'standard_400', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'mini', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'standard_600', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0),
      'mega', jsonb_build_object('monthly_limit', 0, 'used_month', 0, 'remaining', 0),
      'mini_referral', jsonb_build_object('limit', 0, 'done', 0, 'remaining', 0)
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

  -- Mega V1 eliminado: ahora los megas solo vienen de referral_mega_grants (V2)
  -- El frontend ya carga grants V2 por separado en ads.component.ts
  RETURN jsonb_build_object(
    'has_package', true,
    'active_refs', v_active_refs,
    'standard_400', jsonb_build_object('limit', v_std400_limit, 'done', v_std400_done, 'remaining', GREATEST(v_std400_limit - v_std400_done, 0)),
    'mini', jsonb_build_object('limit', v_mini_limit, 'done', v_mini_done, 'remaining', GREATEST(v_mini_limit - v_mini_done, 0)),
    'standard_600', jsonb_build_object('limit', v_std600_limit, 'done', v_std600_done, 'remaining', GREATEST(v_std600_limit - v_std600_done, 0)),
    'mega', jsonb_build_object('monthly_limit', 0, 'used_month', 0, 'remaining', 0),
    'mini_referral', jsonb_build_object('total_slots', v_mini_ref_slots, 'done', v_mini_ref_done, 'remaining', GREATEST(v_mini_ref_slots - v_mini_ref_done, 0))
  );
END;
$$;
