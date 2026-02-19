-- =============================================================================
-- PublihazClick - Fase 3: Lógica de Negocio Completa
-- Paquetes publicitarios, tipos de anuncios, sistema demo/real, niveles
-- IMPORTANTE: Ejecutar primero las migraciones 001, 002, 003, 004
-- =============================================================================

-- 1. CREAR ENUMS ADICIONALES (usando IF NOT EXISTS)
-- =============================================================================

-- Enum para tipo de anuncio PTC
DO $$
BEGIN
  CREATE TYPE ptc_ad_type AS ENUM ('mega', 'standard_400', 'standard_600', 'mini');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Enum para estado del banner del paquete
DO $$
BEGIN
  CREATE TYPE package_banner_status AS ENUM ('pending', 'active', 'completed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- 2. AGREGAR CAMPOS A TABLA PACKAGES
-- =============================================================================

ALTER TABLE packages ADD COLUMN IF NOT EXISTS min_ptc_visits INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS min_banner_views INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS included_ptc_ads INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS has_clickable_banner BOOLEAN DEFAULT FALSE;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS banner_clicks_limit INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS banner_impressions_limit INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS daily_ptc_limit INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

-- 3. INSERTAR PAQUETES NUEVOS
-- =============================================================================

INSERT INTO packages (
  name, description, package_type, price, duration_days, currency,
  features, min_ptc_visits, min_banner_views, included_ptc_ads,
  has_clickable_banner, banner_clicks_limit, banner_impressions_limit,
  daily_ptc_limit, max_ptc_ads, max_banner_ads, max_campaigns,
  ptc_reward_bonus, banner_reward_bonus, referral_bonus,
  is_active, display_order
)
SELECT 
  name, description, package_type, price, duration_days, COALESCE(currency, 'USD'),
  features, min_ptc_visits, min_banner_views, included_ptc_ads,
  has_clickable_banner, banner_clicks_limit, banner_impressions_limit,
  daily_ptc_limit, max_ptc_ads, max_banner_ads, max_campaigns,
  ptc_reward_bonus, banner_reward_bonus, referral_bonus,
  is_active, display_order
FROM (
  VALUES
  (
    'Starter',
    'Paquete inicial para empezar a ganar. Incluye acceso a Mega Anuncios y banner clickeable.',
    'basic',
    25.00,
    30,
    'USD',
    '["Acceso a Mega Anuncios PTC", "1 Banner clickeable (500 clicks)", "500 impresiones de banner", "Sistema de referidos nivel 1", "Minimo 50 visitas PTC/mes", "Minimo 100 visualizaciones banner/mes"]',
    50,
    100,
    5,
    TRUE,
    500,
    1000,
    5,
    5,
    1,
    1,
    5,
    0,
    5,
    TRUE,
    1
  ),
  (
    'Growth',
    'Paquete de crecimiento con mas anuncios y mayor alcance de banner.',
    'premium',
    50.00,
    30,
    'USD',
    '["Acceso a Mega Anuncios y Standard", "1 Banner clickeable (1500 clicks)", "2000 impresiones de banner", "Sistema de referidos hasta nivel 2", "Minimo 150 visitas PTC/mes", "Minimo 300 visualizaciones banner/mes", "Bonificacion de 10% en ganancias PTC"]',
    150,
    300,
    15,
    TRUE,
    1500,
    3000,
    10,
    15,
    2,
    3,
    10,
    5,
    10,
    TRUE,
    2
  ),
  (
    'Business',
    'Paquete empresarial para maxima exposicion y ganancias.',
    'enterprise',
    100.00,
    30,
    'USD',
    '["Acceso a todos los tipos de anuncios", "1 Banner clickeable (4000 clicks)", "6000 impresiones de banner", "Sistema de referidos hasta nivel 4", "Minimo 400 visitas PTC/mes", "Minimo 800 visualizaciones banner/mes", "Bonificacion de 25% en ganancias PTC", "Soporte prioritario"]',
    400,
    800,
    40,
    TRUE,
    4000,
    8000,
    25,
    40,
    5,
    10,
    25,
    15,
    20,
    TRUE,
    3
  ),
  (
    'Enterprise Pro',
    'Paquete maximo para profesionales del marketing. Alcance ilimitado.',
    'custom',
    150.00,
    30,
    'USD',
    '["Acceso ilimitado a todos los anuncios", "1 Banner clickeable (10000 clicks)", "15000 impresiones de banner", "Sistema de referidos multinivel completo", "Minimo 1000 visitas PTC/mes", "Minimo 2000 visualizaciones banner/mes", "Bonificacion de 50% en ganancias PTC", "API de gestion", "Asesoria dedicada"]',
    1000,
    2000,
    100,
    TRUE,
    10000,
    20000,
    50,
    999999,
    10,
    999999,
    50,
    25,
    30,
    TRUE,
    4
  )
) AS vals(
  name, description, package_type, price, duration_days, currency,
  features, min_ptc_visits, min_banner_views, included_ptc_ads,
  has_clickable_banner, banner_clicks_limit, banner_impressions_limit,
  daily_ptc_limit, max_ptc_ads, max_banner_ads, max_campaigns,
  ptc_reward_bonus, banner_reward_bonus, referral_bonus,
  is_active, display_order
)
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = vals.name);

-- 4. ACTUALIZAR TABLA PTC_TASKS CON TIPO DE ANUNCIO
-- =============================================================================

ALTER TABLE ptc_tasks ADD COLUMN IF NOT EXISTS ad_type ptc_ad_type DEFAULT 'standard_400';
ALTER TABLE ptc_tasks ADD COLUMN IF NOT EXISTS is_demo_only BOOLEAN DEFAULT FALSE;

-- Actualizar anuncios existentes segun recompensa
UPDATE ptc_tasks SET ad_type = 'mega' WHERE reward >= 1000;
UPDATE ptc_tasks SET ad_type = 'standard_600' WHERE reward >= 600 AND reward < 1000;
UPDATE ptc_tasks SET ad_type = 'standard_400' WHERE reward >= 400 AND reward < 600;
UPDATE ptc_tasks SET ad_type = 'mini' WHERE reward < 400;

-- 5. AGREGAR CAMPOS DEMO/REAL A PROFILES
-- =============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS demo_balance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS real_balance DECIMAL(12,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_demo_earned DECIMAL(12,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_donated DECIMAL(12,2) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_referrals_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS has_active_package BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS package_started_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_link VARCHAR(255);

-- Actualizar referral_link basado en referral_code
UPDATE profiles SET referral_link = '/register?ref=' || referral_code WHERE referral_link IS NULL;

-- 6. CREAR TABLA DE NIVELES
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level INTEGER UNIQUE NOT NULL,
  name VARCHAR(50) NOT NULL,
  min_referrals INTEGER NOT NULL DEFAULT 0,
  max_referrals INTEGER,
  referral_bonus_percentage DECIMAL(5,2) DEFAULT 0,
  ptc_reward_multiplier DECIMAL(3,2) DEFAULT 1.00,
  daily_ptc_limit INTEGER DEFAULT 5,
  description TEXT,
  icon_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE user_levels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active user levels" ON user_levels;
CREATE POLICY "Anyone can view active user levels"
  ON user_levels FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admins can manage user levels" ON user_levels;
CREATE POLICY "Admins can manage user levels"
  ON user_levels FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );

-- Insertar niveles iniciales
INSERT INTO user_levels (level, name, min_referrals, max_referrals, referral_bonus_percentage, ptc_reward_multiplier, daily_ptc_limit, description)
VALUES
(1, 'Novato', 0, 4, 5, 1.00, 5, 'Empieza tu camino. Gana el 5% de tus referidos directos.'),
(2, 'Afiliado', 5, 14, 10, 1.10, 10, 'Has referido 5 personas. Gana el 10% y 10% mas en cada PTC.'),
(3, 'Promotor', 15, 29, 15, 1.20, 15, '15 referidos alcanzados. Gana el 15% y 20% mas en cada PTC.'),
(4, 'Influencer', 30, 49, 20, 1.30, 25, '30 referidos. Gana el 20% y 30% mas en cada PTC.'),
(5, 'Embajador', 50, 99, 25, 1.50, 50, '50 referidos. Gana el 25% y 50% mas en cada PTC.'),
(6, 'Lider', 100, 199, 30, 2.00, 75, '100 referidos. Gana el 30% y el doble en cada PTC.'),
(7, 'Maestro', 200, 499, 35, 2.50, 100, '200 referidos. Gana el 35% y 2.5x en cada PTC.'),
(8, 'VIP', 500, NULL, 50, 3.00, 200, '500+ referidos. Gana el 50% y 3x en cada PTC. Acceso VIP.')
ON CONFLICT (level) DO NOTHING;

-- 7. CREAR TABLA DE DONACIONES
-- =============================================================================

CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  source VARCHAR(50) NOT NULL,
  source_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own donations" ON donations;
CREATE POLICY "Users can view their own donations"
  ON donations FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all donations" ON donations;
CREATE POLICY "Admins can view all donations"
  ON donations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );

-- 8. CREAR TABLA DE BANNERS DE PAQUETES
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'package_banners') THEN
    CREATE TABLE package_banners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      user_package_id UUID REFERENCES user_packages(id) ON DELETE CASCADE,
      name VARCHAR(255),
      image_url TEXT NOT NULL,
      target_url TEXT NOT NULL,
      clicks_limit INTEGER NOT NULL DEFAULT 1000,
      impressions_limit INTEGER NOT NULL DEFAULT 1000,
      total_clicks INTEGER DEFAULT 0,
      total_impressions INTEGER DEFAULT 0,
      status package_banner_status DEFAULT 'pending',
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      approved_by UUID REFERENCES profiles(id),
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    ALTER TABLE package_banners ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users can view their own package banners"
      ON package_banners FOR SELECT
      USING (user_id = auth.uid());

    CREATE POLICY "Users can create their own package banners"
      ON package_banners FOR INSERT
      WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update their own package banners"
      ON package_banners FOR UPDATE
      USING (user_id = auth.uid());

    CREATE POLICY "Admins can manage all package banners"
      ON package_banners FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'dev')
        )
      );
  END IF;
END $$;

-- 9. CREAR FUNCIONES
-- =============================================================================

-- Funcion para calcular donacion (1%)
CREATE OR REPLACE FUNCTION calculate_donation(amount DECIMAL(10,2))
RETURNS DECIMAL(10,2) AS $$
BEGIN
  RETURN ROUND(amount * 0.01, 2);
END;
$$ LANGUAGE plpgsql;

-- Funcion para registrar ganancia con donacion
CREATE OR REPLACE FUNCTION record_earning_with_donation(
  p_user_id UUID,
  p_amount DECIMAL(10,2),
  p_source VARCHAR(50),
  p_source_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  donation_amount DECIMAL(10,2);
  net_amount DECIMAL(10,2);
  user_has_package BOOLEAN;
BEGIN
  SELECT has_active_package INTO user_has_package
  FROM profiles WHERE id = p_user_id;

  donation_amount := calculate_donation(p_amount);
  net_amount := p_amount - donation_amount;

  INSERT INTO donations (user_id, amount, source, source_id, description)
  VALUES (p_user_id, donation_amount, p_source, p_source_id,
          COALESCE(p_description, 'Donacion del 1% de ganancia'));

  UPDATE profiles
  SET total_donated = total_donated + donation_amount
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'gross_amount', p_amount,
    'donation_amount', donation_amount,
    'net_amount', net_amount,
    'has_active_package', user_has_package
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. CREAR FUNCION PARA VALIDAR CODIGO DE REFERIDO
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_referral_code(code VARCHAR)
RETURNS JSONB AS $$
DECLARE
  referrer profiles%ROWTYPE;
BEGIN
  SELECT * INTO referrer
  FROM profiles
  WHERE referral_code = code;

  IF referrer.id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'Codigo de referido no valido'
    );
  END IF;

  IF referrer.is_active = FALSE THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'El referidor no esta activo'
    );
  END IF;

  RETURN jsonb_build_object(
    'valid', TRUE,
    'referrer_id', referrer.id,
    'referrer_username', referrer.username,
    'referrer_level', referrer.level
  );
END;
$$ LANGUAGE plpgsql;

-- 11. CREAR FUNCION PARA ACTIVAR PAQUETE DE USUARIO
-- =============================================================================

DROP FUNCTION IF EXISTS activate_user_package(UUID, UUID);

CREATE OR REPLACE FUNCTION activate_user_package(
  p_user_id UUID,
  p_package_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_package RECORD;
  v_user_package_id UUID;
  v_package_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM packages WHERE id = p_package_id) INTO v_package_exists;
  
  IF NOT v_package_exists THEN
    RETURN FALSE;
  END IF;
  
  SELECT * INTO v_package FROM packages WHERE id = p_package_id;

  INSERT INTO user_packages (
    user_id, package_id, package_name, start_date, end_date, status
  )
  VALUES (
    p_user_id, p_package_id, v_package.name, NOW(),
    NOW() + (v_package.duration_days || ' days')::INTERVAL, 'active'
  )
  RETURNING id INTO v_user_package_id;

  UPDATE profiles
  SET
    has_active_package = TRUE,
    current_package_id = p_package_id,
    package_started_at = NOW(),
    package_expires_at = NOW() + (v_package.duration_days || ' days')::INTERVAL,
    role = CASE WHEN role = 'guest' THEN 'advertiser' ELSE role END,
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. CREAR INDICES ADICIONALES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ptc_tasks_ad_type ON ptc_tasks(ad_type);
CREATE INDEX IF NOT EXISTS idx_ptc_tasks_is_demo_only ON ptc_tasks(is_demo_only);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_link ON profiles(referral_link);
CREATE INDEX IF NOT EXISTS idx_profiles_has_active_package ON profiles(has_active_package);
CREATE INDEX IF NOT EXISTS idx_donations_user_id ON donations(user_id);
CREATE INDEX IF NOT EXISTS idx_package_banners_user_id ON package_banners(user_id);
CREATE INDEX IF NOT EXISTS idx_package_banners_status ON package_banners(status);

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
