-- =============================================================================
-- Migration 076: Sistema de comisiones por referido en todos los módulos
-- Tabla de configuración (porcentajes editables por admin) + tabla de registro
-- =============================================================================

-- ── 1. Configuración de porcentajes por módulo ────────────────────────────
CREATE TABLE IF NOT EXISTS referral_commission_settings (
  id           text        PRIMARY KEY, -- 'cursos', 'movi', 'trading_bot', 'herramientas_ia', 'sms_masivos'
  label        text        NOT NULL,
  percentage   numeric(5,2) NOT NULL DEFAULT 0,
  is_active    boolean     NOT NULL DEFAULT true,
  updated_at   timestamptz DEFAULT now(),
  updated_by   uuid        REFERENCES profiles(id)
);

ALTER TABLE referral_commission_settings ENABLE ROW LEVEL SECURITY;

-- Todos pueden leer la config, solo admin puede escribir
DROP POLICY IF EXISTS "anyone_reads_commission_settings" ON referral_commission_settings;
CREATE POLICY "anyone_reads_commission_settings" ON referral_commission_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_manages_commission_settings" ON referral_commission_settings;
CREATE POLICY "service_manages_commission_settings" ON referral_commission_settings FOR ALL USING (true) WITH CHECK (true);

-- Insertar valores por defecto
INSERT INTO referral_commission_settings (id, label, percentage) VALUES
  ('cursos',          'Cursos (Academia)',      20.00),
  ('movi',            'Movi (Anda y Gana)',      2.00),
  ('trading_bot',     'Trading Bot AI',          1.00),
  ('herramientas_ia', 'Herramientas IA',         2.00),
  ('sms_masivos',     'SMS Masivos',             2.00)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Registro de comisiones generadas ───────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_commissions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     uuid        NOT NULL REFERENCES profiles(id),
  referred_id     uuid        NOT NULL REFERENCES profiles(id),
  module          text        NOT NULL, -- 'cursos', 'movi', 'trading_bot', 'herramientas_ia', 'sms_masivos'
  source_amount   numeric(12,2) NOT NULL, -- monto original de la compra/recarga
  percentage      numeric(5,2) NOT NULL,  -- porcentaje aplicado
  commission      numeric(12,2) NOT NULL, -- monto de la comisión
  source_id       text,                   -- ID de la compra/recarga/servicio original
  description     text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ref_commissions_referrer ON referral_commissions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_ref_commissions_referred ON referral_commissions(referred_id);
CREATE INDEX IF NOT EXISTS idx_ref_commissions_module   ON referral_commissions(module);

ALTER TABLE referral_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sees_own_commissions" ON referral_commissions;
CREATE POLICY "user_sees_own_commissions" ON referral_commissions FOR SELECT
  USING (referrer_id = auth.uid());

DROP POLICY IF EXISTS "service_manages_commissions" ON referral_commissions;
CREATE POLICY "service_manages_commissions" ON referral_commissions FOR ALL
  USING (true) WITH CHECK (true);

-- ── 3. Función para acreditar comisión por referido ───────────────────────
-- Valida: referidor existe, tiene/tuvo paquete, porcentaje activo
CREATE OR REPLACE FUNCTION credit_referral_commission(
  p_referred_id   uuid,
  p_module        text,
  p_source_amount numeric,
  p_source_id     text DEFAULT NULL,
  p_description   text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_referrer_id   uuid;
  v_percentage    numeric;
  v_is_active     boolean;
  v_commission    numeric;
  v_had_package   boolean;
BEGIN
  -- 1. Obtener el referidor del usuario
  SELECT referred_by INTO v_referrer_id
  FROM profiles WHERE id = p_referred_id;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer');
  END IF;

  -- 2. Verificar que el referidor tiene o tuvo paquete activo
  SELECT (
    has_active_package = true
    OR current_package_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM user_packages WHERE user_id = v_referrer_id LIMIT 1)
  ) INTO v_had_package
  FROM profiles WHERE id = v_referrer_id;

  IF NOT COALESCE(v_had_package, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'referrer_no_package');
  END IF;

  -- 3. Obtener porcentaje del módulo
  SELECT percentage, is_active INTO v_percentage, v_is_active
  FROM referral_commission_settings WHERE id = p_module;

  IF v_percentage IS NULL OR NOT COALESCE(v_is_active, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'module_inactive');
  END IF;

  -- 4. Calcular comisión
  v_commission := ROUND(p_source_amount * v_percentage / 100, 2);

  IF v_commission <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'zero_commission');
  END IF;

  -- 5. Acreditar en real_balance del referidor
  UPDATE profiles
  SET real_balance = real_balance + v_commission,
      total_earned = total_earned + v_commission,
      referral_earnings = referral_earnings + v_commission
  WHERE id = v_referrer_id;

  -- 6. Registrar comisión
  INSERT INTO referral_commissions (referrer_id, referred_id, module, source_amount, percentage, commission, source_id, description)
  VALUES (v_referrer_id, p_referred_id, p_module, p_source_amount, v_percentage, v_commission, p_source_id, p_description);

  RETURN jsonb_build_object(
    'ok', true,
    'referrer_id', v_referrer_id,
    'commission', v_commission,
    'percentage', v_percentage
  );
END;
$$;
