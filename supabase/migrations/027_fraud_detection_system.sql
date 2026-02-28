-- ============================================================================
-- 027: Sistema de Detección de Fraude PTC
-- ============================================================================
-- Enriquece ptc_clicks con metadata anti-fraude, crea tablas de scoring y reglas,
-- y actualiza el RPC record_ptc_click para aceptar los nuevos parámetros.
-- ============================================================================

-- 1. Agregar columnas de metadata anti-fraude a ptc_clicks
ALTER TABLE ptc_clicks
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS session_fingerprint VARCHAR(64),
  ADD COLUMN IF NOT EXISTS click_duration_ms INTEGER;

-- 2. Índices para análisis de fraude
CREATE INDEX IF NOT EXISTS idx_ptc_clicks_ip_address ON ptc_clicks (ip_address);
CREATE INDEX IF NOT EXISTS idx_ptc_clicks_session_fingerprint ON ptc_clicks (session_fingerprint);
CREATE INDEX IF NOT EXISTS idx_ptc_clicks_completed_at ON ptc_clicks (completed_at);

-- 3. Tabla de scores de fraude por usuario
CREATE TABLE IF NOT EXISTS fraud_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  risk_level VARCHAR(10) NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  clicks_analyzed INTEGER NOT NULL DEFAULT 0,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_fraud_scores_risk_level ON fraud_scores (risk_level);
CREATE INDEX IF NOT EXISTS idx_fraud_scores_score ON fraud_scores (score DESC);

-- 4. Tabla de reglas de fraude configurables
CREATE TABLE IF NOT EXISTS fraud_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 10 CHECK (weight >= 0 AND weight <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Insertar reglas base de fraude
INSERT INTO fraud_rules (name, description, weight, is_active, parameters) VALUES
  ('rapid_clicks', 'Más de 3 clicks en menos de 60 segundos del mismo usuario', 25, true,
   '{"max_clicks": 3, "window_seconds": 60}'::jsonb),
  ('same_ip_multi_user', 'Misma IP usada por más de 2 usuarios distintos en 24 horas', 30, true,
   '{"max_users": 2, "window_hours": 24}'::jsonb),
  ('same_fingerprint_multi_user', 'Mismo fingerprint usado por más de 2 usuarios distintos', 35, true,
   '{"max_users": 2, "window_hours": 24}'::jsonb),
  ('impossible_speed', 'Duración del click menor al 80% del timer mínimo requerido', 20, true,
   '{"min_ratio": 0.8}'::jsonb),
  ('uniform_timing', 'Desviación estándar de tiempos menor a 2 segundos (patrón de bot)', 15, true,
   '{"max_stddev_ms": 2000, "min_clicks": 5}'::jsonb),
  ('burst_pattern', 'Más del 80% de clicks diarios realizados en una ventana de 30 minutos', 20, true,
   '{"burst_ratio": 0.8, "window_minutes": 30}'::jsonb),
  ('referral_farm', 'Más de 5 referidos registrados desde la misma IP o fingerprint', 25, true,
   '{"max_referrals_same_source": 5}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- 6. RLS para fraud_scores
ALTER TABLE fraud_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access fraud_scores" ON fraud_scores;
CREATE POLICY "Admin full access fraud_scores" ON fraud_scores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dev')
    )
  );

-- 7. RLS para fraud_rules
ALTER TABLE fraud_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access fraud_rules" ON fraud_rules;
CREATE POLICY "Admin full access fraud_rules" ON fraud_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dev')
    )
  );

-- 8. Eliminar versión anterior del RPC (2 params) y crear nueva con metadata de fraude
DROP FUNCTION IF EXISTS record_ptc_click(UUID, UUID);

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
  v_task          ptc_tasks%ROWTYPE;
  v_already_done  INT;
  v_daily_count   INT;
  v_daily_limit   INT;
  v_reward        NUMERIC;
  v_today_col     DATE;
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

  -- 3. Límites diarios por tipo: standard_400→5, mini→4, standard_600→3, mega→1
  v_daily_limit := CASE v_task.ad_type
    WHEN 'standard_400' THEN 5
    WHEN 'mini'         THEN 4
    WHEN 'standard_600' THEN 3
    WHEN 'mega'         THEN 1
    ELSE 5
  END;

  -- 4. Cuántos de este tipo ha visto hoy (hora Colombia)
  SELECT COUNT(*) INTO v_daily_count
  FROM ptc_clicks pc
  JOIN ptc_tasks  pt ON pt.id = pc.task_id
  WHERE pc.user_id = p_user_id
    AND pt.ad_type = v_task.ad_type
    AND (pc.completed_at AT TIME ZONE 'America/Bogota')::date = v_today_col;
  IF v_daily_count >= v_daily_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Límite diario de anuncios de este tipo alcanzado');
  END IF;

  -- 5. Recompensa fija: standard_400→400, mini→83.33, standard_600→600, mega→2000
  v_reward := CASE v_task.ad_type
    WHEN 'standard_400' THEN 400.00
    WHEN 'mini'         THEN 83.33
    WHEN 'standard_600' THEN 600.00
    WHEN 'mega'         THEN 2000.00
    ELSE 83.33
  END;

  -- 6. Insertar click en ptc_clicks CON metadata anti-fraude
  INSERT INTO ptc_clicks (user_id, task_id, reward_earned, ip_address, user_agent, session_fingerprint, click_duration_ms)
  VALUES (p_user_id, p_task_id, v_reward, p_ip_address, p_user_agent, p_session_fingerprint, p_click_duration_ms);

  -- 7. Incrementar total_clicks en ptc_tasks
  UPDATE ptc_tasks SET total_clicks = total_clicks + 1 WHERE id = p_task_id;

  -- 8. Marcar asignación diaria como completada si existe (opcional legacy)
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

-- Otorgar permisos a la nueva función
GRANT EXECUTE ON FUNCTION record_ptc_click(UUID, UUID, VARCHAR, TEXT, VARCHAR, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION record_ptc_click(UUID, UUID, VARCHAR, TEXT, VARCHAR, INTEGER) TO anon;
