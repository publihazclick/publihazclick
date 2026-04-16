-- ============================================================================
-- 099: Gate de clicks PTC aplica a TODOS los paquetes activos (sin cutoff)
-- ----------------------------------------------------------------------------
-- La migración 094 introdujo un cutoff (2026-04-11) para que la regla solo
-- aplicara a paquetes nuevos. Esto dejaba a usuarios viejos haciendo clicks
-- sin necesidad de crear su PTC + banner del ciclo, lo cual no es lo que el
-- producto necesita.
--
-- Esta migración:
-- 1. Elimina el cutoff: cualquier usuario con paquete activo debe tener
--    PTC + banner creados después de su `package_started_at` para hacer clicks.
-- 2. Reescribe `get_user_ad_limits`, `user_ad_creation_gate_blocks` y
--    `record_ptc_click` (solo el bloque del gate) sin la constante de fecha.
-- 3. La regla aplica para nuevos paquetes Y para los que ya estaban activos.
-- ============================================================================

-- ── 1) get_user_ad_limits: gate sin cutoff ───────────────────────────────────
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

  -- Gate: aplica SIEMPRE (sin cutoff). Usuario debe tener PTC + banner del ciclo actual.
  IF v_pkg_started IS NOT NULL THEN
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

  -- Resto de la lógica (idéntica a 094)
  SELECT COUNT(*)::INT INTO v_active_refs
  FROM profiles WHERE referred_by = p_user_id AND has_active_package = true;

  v_std400_limit := CASE WHEN v_active_refs >= 20 THEN 15 ELSE 5 END;
  v_mini_limit := 4;
  v_std600_limit := 3;

  v_mega_monthly_limit := v_active_refs * 5;
  SELECT COUNT(*)::INT INTO v_mega_used_month
  FROM ptc_clicks pc
  JOIN ptc_tasks pt ON pt.id = pc.task_id
  WHERE pc.user_id = p_user_id
    AND pt.ad_type = 'mega'
    AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date >= v_month_start;
  v_mega_remaining := GREATEST(v_mega_monthly_limit - v_mega_used_month, 0);

  v_mini_ref_slots := v_active_refs * get_mini_referral_slots_per_affiliate(v_active_refs);

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


-- ── 2) user_ad_creation_gate_blocks: sin cutoff ──────────────────────────────
CREATE OR REPLACE FUNCTION user_ad_creation_gate_blocks(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_pkg_started TIMESTAMPTZ;
  v_has_package BOOLEAN;
  v_has_ptc BOOLEAN;
  v_has_banner BOOLEAN;
BEGIN
  SELECT has_active_package, package_started_at
    INTO v_has_package, v_pkg_started
  FROM profiles WHERE id = p_user_id;

  -- Sin paquete activo: el gate no aplica (no podría hacer clicks de todos modos).
  IF NOT COALESCE(v_has_package, false) THEN
    RETURN false;
  END IF;

  IF v_pkg_started IS NULL THEN
    -- Defensa: si por alguna razón no hay fecha de inicio, bloquear hasta crear.
    RETURN true;
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


-- ── 3) Trigger BEFORE INSERT en ptc_clicks: defensa en profundidad ───────────
-- Aunque record_ptc_click ya valida, este trigger asegura que NINGÚN insert
-- directo a ptc_clicks pueda saltarse el gate (defensa contra bugs futuros).
CREATE OR REPLACE FUNCTION enforce_ad_creation_gate_on_clicks()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF user_ad_creation_gate_blocks(NEW.user_id) THEN
    RAISE EXCEPTION 'Debes crear tu anuncio PTC y tu banner antes de hacer clicks en los anuncios.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ad_gate_on_clicks ON ptc_clicks;
CREATE TRIGGER trg_enforce_ad_gate_on_clicks
  BEFORE INSERT ON ptc_clicks
  FOR EACH ROW
  EXECUTE FUNCTION enforce_ad_creation_gate_on_clicks();
