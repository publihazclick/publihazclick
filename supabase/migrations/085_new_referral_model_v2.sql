-- =============================================================================
-- Migration 085: Nuevo modelo de referidos V2
-- Fecha: 2026-04-10
--
-- CAMBIOS:
-- 1. Tabla referral_mega_grants para rastrear mega ads otorgados por compra
-- 2. Función grant_referral_mega_rewards() - otorga megas al referidor
-- 3. Modificar approve_payment() para llamar a grant_referral_mega_rewards()
-- 4. Modificar record_ptc_click() para NO pagar comisión por clicks de
--    referidos NUEVOS (created_at >= 2026-04-10)
-- 5. Modificar conteo de mini_referral slots para solo contar referidos OLD
--
-- REGLA DE ORO: referidos creados ANTES de 2026-04-10 => sistema viejo intacto
--               referidos creados A PARTIR de 2026-04-10 => sistema nuevo
-- =============================================================================

-- Constante: fecha de corte para el nuevo modelo
-- Los referidos cuyo registro en profiles.created_at >= esta fecha usan el nuevo sistema
-- DO NOT CHANGE THIS DATE

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla para rastrear mega ads otorgados como recompensa por referido
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_mega_grants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  payment_id   UUID,  -- referencia al pago que disparó la recompensa
  ad_type      TEXT NOT NULL,  -- 'mega_2000', 'mega_5000', 'mega_10000', 'mega_20000'
  quantity     INT NOT NULL,
  remaining    INT NOT NULL,
  reward_per_ad NUMERIC(10,2) NOT NULL,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rmg_referrer ON referral_mega_grants(referrer_id);
CREATE INDEX IF NOT EXISTS idx_rmg_referred ON referral_mega_grants(referred_id);
CREATE INDEX IF NOT EXISTS idx_rmg_expires  ON referral_mega_grants(expires_at);

-- RLS
ALTER TABLE referral_mega_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own grants"
  ON referral_mega_grants FOR SELECT
  USING (referrer_id = auth.uid());

CREATE POLICY "Admins full access referral_mega_grants"
  ON referral_mega_grants FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dev')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Función: determinar recompensa según categoría del referidor
--    Retorna JSONB con los mega ads a otorgar
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_referral_v2_rewards(p_active_refs INT)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  -- Jade: 0-2 refs → 14 mega_2000
  IF p_active_refs <= 2 THEN
    RETURN jsonb_build_array(
      jsonb_build_object('ad_type', 'mega_2000', 'quantity', 14, 'reward', 2000)
    );
  -- Perla: 3-5 refs → 8 mega_5000 + 3 mega_2000
  ELSIF p_active_refs BETWEEN 3 AND 5 THEN
    RETURN jsonb_build_array(
      jsonb_build_object('ad_type', 'mega_5000', 'quantity', 8, 'reward', 5000),
      jsonb_build_object('ad_type', 'mega_2000', 'quantity', 3, 'reward', 2000)
    );
  -- Zafiro: 6-9 refs → 6 mega_10000 + 2 mega_2000
  ELSIF p_active_refs BETWEEN 6 AND 9 THEN
    RETURN jsonb_build_array(
      jsonb_build_object('ad_type', 'mega_10000', 'quantity', 6, 'reward', 10000),
      jsonb_build_object('ad_type', 'mega_2000',  'quantity', 2, 'reward', 2000)
    );
  -- Ruby: 10-19 refs → 4 mega_20000 + 1 mega_2000
  ELSIF p_active_refs BETWEEN 10 AND 19 THEN
    RETURN jsonb_build_array(
      jsonb_build_object('ad_type', 'mega_20000', 'quantity', 4, 'reward', 20000),
      jsonb_build_object('ad_type', 'mega_2000',  'quantity', 1, 'reward', 2000)
    );
  -- Esmeralda+ (20+) → 4 mega_20000 + 1 mega_5000
  ELSE
    RETURN jsonb_build_array(
      jsonb_build_object('ad_type', 'mega_20000', 'quantity', 4, 'reward', 20000),
      jsonb_build_object('ad_type', 'mega_5000',  'quantity', 1, 'reward', 5000)
    );
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Función principal: otorgar mega ads al referidor cuando su invitado compra
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION grant_referral_mega_rewards(
  p_buyer_id   UUID,
  p_payment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_referrer_id     UUID;
  v_buyer_created   TIMESTAMPTZ;
  v_referrer_active BOOLEAN;
  v_active_refs     INT;
  v_rewards         JSONB;
  v_item            JSONB;
  v_total_granted   INT := 0;
  V2_CUTOFF CONSTANT TIMESTAMPTZ := '2026-04-10T00:00:00-05:00'; -- Colombia time
BEGIN
  -- 1. Obtener referidor del comprador
  SELECT referred_by INTO v_referrer_id FROM profiles WHERE id = p_buyer_id;
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_referrer');
  END IF;

  -- 2. Verificar que el comprador es un referido NUEVO (v2)
  SELECT created_at INTO v_buyer_created FROM profiles WHERE id = p_buyer_id;
  IF v_buyer_created < V2_CUTOFF THEN
    RETURN jsonb_build_object('success', false, 'reason', 'old_referral_v1_system');
  END IF;

  -- 3. Verificar que el referidor tiene paquete activo
  SELECT has_active_package INTO v_referrer_active FROM profiles WHERE id = v_referrer_id;
  IF NOT COALESCE(v_referrer_active, false) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'referrer_no_active_package');
  END IF;

  -- 4. Contar referidos activos del referidor (TODOS, no solo nuevos)
  SELECT COUNT(*)::INT INTO v_active_refs
  FROM profiles
  WHERE referred_by = v_referrer_id AND has_active_package = true;

  -- 5. Obtener recompensas según categoría
  v_rewards := get_referral_v2_rewards(v_active_refs);

  -- 6. Insertar los grants
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_rewards)
  LOOP
    INSERT INTO referral_mega_grants (
      referrer_id, referred_id, payment_id,
      ad_type, quantity, remaining, reward_per_ad,
      granted_at, expires_at
    ) VALUES (
      v_referrer_id, p_buyer_id, p_payment_id,
      v_item->>'ad_type',
      (v_item->>'quantity')::INT,
      (v_item->>'quantity')::INT,
      (v_item->>'reward')::NUMERIC,
      NOW(),
      NOW() + INTERVAL '30 days'
    );
    v_total_granted := v_total_granted + (v_item->>'quantity')::INT;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'active_refs', v_active_refs,
    'total_ads_granted', v_total_granted,
    'rewards', v_rewards
  );
END;
$$;

GRANT EXECUTE ON FUNCTION grant_referral_mega_rewards(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Función: consumir un mega grant (cuando el usuario clickea un mega v2)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION consume_referral_mega_grant(
  p_user_id  UUID,
  p_ad_type  TEXT  -- 'mega_2000', 'mega_5000', 'mega_10000', 'mega_20000'
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_grant   RECORD;
  v_reward  NUMERIC;
BEGIN
  -- Buscar el grant más antiguo no expirado con remaining > 0
  SELECT * INTO v_grant
  FROM referral_mega_grants
  WHERE referrer_id = p_user_id
    AND ad_type = p_ad_type
    AND remaining > 0
    AND expires_at > NOW()
  ORDER BY granted_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_grant.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No tienes mega anuncios disponibles de este tipo');
  END IF;

  v_reward := v_grant.reward_per_ad;

  -- Decrementar remaining
  UPDATE referral_mega_grants SET remaining = remaining - 1 WHERE id = v_grant.id;

  -- Acreditar al usuario
  UPDATE profiles
  SET real_balance = real_balance + v_reward,
      total_earned = total_earned + v_reward,
      updated_at   = NOW()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'reward', v_reward,
    'ad_type', p_ad_type,
    'remaining_in_grant', v_grant.remaining - 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION consume_referral_mega_grant(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Función helper: obtener mega grants disponibles para un usuario
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_available_mega_grants(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(g)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      ad_type,
      SUM(remaining)::INT as available,
      reward_per_ad,
      MIN(expires_at) as earliest_expiry
    FROM referral_mega_grants
    WHERE referrer_id = p_user_id
      AND remaining > 0
      AND expires_at > NOW()
    GROUP BY ad_type, reward_per_ad
    ORDER BY reward_per_ad DESC
  ) g;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_available_mega_grants(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Modificar approve_payment() para llamar a grant_referral_mega_rewards()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_payment(p_payment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_payment RECORD;
  v_up_id   UUID;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id AND status = 'pending';
  IF v_payment.id IS NULL THEN RETURN FALSE; END IF;

  UPDATE payments SET status = 'approved', updated_at = NOW() WHERE id = p_payment_id;
  PERFORM activate_user_package(v_payment.user_id, v_payment.package_id);

  SELECT id INTO v_up_id FROM user_packages
  WHERE user_id = v_payment.user_id AND package_id = v_payment.package_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_up_id IS NOT NULL THEN
    UPDATE user_packages
    SET payment_method = 'nequi', payment_id = v_payment.gateway_transaction_id
    WHERE id = v_up_id;
  END IF;

  -- V2: Otorgar mega ads al referidor si el comprador es un referido nuevo
  PERFORM grant_referral_mega_rewards(v_payment.user_id, p_payment_id);

  RETURN TRUE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Modificar record_ptc_click() para NO pagar comisión por clicks de
--    referidos NUEVOS (profiles.created_at >= 2026-04-10)
-- ─────────────────────────────────────────────────────────────────────────────
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
  DONATION_PER_AD   CONSTANT NUMERIC := 10.00;
  V2_CUTOFF         CONSTANT TIMESTAMPTZ := '2026-04-10T00:00:00-05:00';
BEGIN
  v_today_col := (NOW() AT TIME ZONE 'America/Bogota')::date;
  v_month_start := date_trunc('month', v_today_col)::date;

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
        -- Registrar click
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
    -- Mega V1: solo cuenta referidos OLD (creados antes del corte)
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

    -- Bonus nivel 1 al referidor directo
    -- SOLO si el usuario que clickea es un referido VIEJO (creado antes de V2_CUTOFF)
    SELECT referred_by, created_at INTO v_referrer_id, v_user_created
    FROM profiles WHERE id = p_user_id;

    -- Determinar si es referido nuevo
    IF v_user_created >= V2_CUTOFF THEN
      v_is_new_referral := true;
    END IF;

    IF v_referrer_id IS NOT NULL AND NOT v_is_new_referral THEN
      -- Sistema V1: pagar comisión por click del referido
      v_referral_bonus := get_referral_click_bonus(v_referrer_id);
      IF v_referral_bonus > 0 THEN
        UPDATE profiles
        SET real_balance = real_balance + v_referral_bonus,
            total_earned = total_earned + v_referral_bonus,
            updated_at   = NOW()
        WHERE id = v_referrer_id;
      END IF;

      -- Bonos de profundidad Diamante Corona DC1-DC5 (solo V1)
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
      -- Referido nuevo (V2) o sin referidor: no se paga comisión por click
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Modificar get_mini_referral_slots_per_affiliate para solo contar
--    referidos OLD en el cálculo de slots
--    NOTA: Esta función es IMMUTABLE y recibe un conteo, así que la lógica
--    de filtrado debe hacerse DONDE se llama, no aquí.
--    Creamos una nueva función que filtra por fecha de corte.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_old_referral_count(p_referrer_id UUID)
RETURNS INT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_count INT;
  V2_CUTOFF CONSTANT TIMESTAMPTZ := '2026-04-10T00:00:00-05:00';
BEGIN
  SELECT COUNT(*)::INT INTO v_count
  FROM profiles
  WHERE referred_by = p_referrer_id
    AND has_active_package = true
    AND created_at < V2_CUTOFF;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_old_referral_count(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Modificar assign_mini_referral_tasks para que solo cuente referidos OLD
--    Los referidos nuevos (>= V2_CUTOFF) NO generan mini_referral slots
-- ─────────────────────────────────────────────────────────────────────────────
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
  V2_CUTOFF CONSTANT TIMESTAMPTZ := '2026-04-10T00:00:00-05:00';
BEGIN
  -- Contar SOLO afiliados activos OLD (creados antes del corte V2)
  SELECT COUNT(*) INTO v_affiliate_count
  FROM profiles
  WHERE referred_by = p_user_id
    AND has_active_package = true
    AND created_at < V2_CUTOFF;

  IF v_affiliate_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'assigned', 0, 'reason', 'no_old_affiliates');
  END IF;

  v_slots_per_affiliate := get_mini_referral_slots_per_affiliate(v_affiliate_count);
  v_total_slots         := v_affiliate_count * v_slots_per_affiliate;

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

-- =============================================================================
-- FIN Migration 085
-- =============================================================================
