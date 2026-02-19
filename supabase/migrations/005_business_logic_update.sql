-- =============================================================================
-- PublihazClick - Fase 3: Lógica de Negocio Completa
-- Paquetes publicitarios, tipos de anuncios, sistema demo/real, niveles
-- IMPORTANTE: Ejecutar primero las migraciones 001, 002, 003, 004
-- =============================================================================

-- 1. CREAR ENUMS ADICIONALES
-- =============================================================================

-- Enum para tipo de anuncio PTC
DO $ BEGIN
  CREATE TYPE ptc_ad_type AS ENUM ('mega', 'standard_400', 'standard_600', 'mini');
EXCEPTION
  WHEN duplicate_object THEN null;
END $;

-- Enum para estado del banner del paquete
DO $ BEGIN
  CREATE TYPE package_banner_status AS ENUM ('pending', 'active', 'completed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN null;
END $;

-- 2. AGREGAR CAMPOS A TABLA PACKAGES (si la tabla existe)
-- =============================================================================

-- Agregar campos adicionales a packages - usando IF EXISTS para cada columna
ALTER TABLE packages ADD COLUMN IF NOT EXISTS min_ptc_visits INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS min_banner_views INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS included_ptc_ads INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS has_clickable_banner BOOLEAN DEFAULT FALSE;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS banner_clicks_limit INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS banner_impressions_limit INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS daily_ptc_limit INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

-- 3. INSERTAR PAQUETES NUEVOS (evitar duplicados)
-- =============================================================================

-- Solo insertar si no existen los paquetes principales
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
    '["Acceso a Mega Anuncios PTC", "1 Banner clickeable (500 clicks)", "500 impresiones de banner", "Sistema de referidos nivel 1", "Mínimo 50 visitas PTC/mes", "Mínimo 100 visualizaciones banner/mes"]',
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
    'Paquete de crecimiento con más anuncios y mayor alcance de banner.',
    'premium',
    50.00,
    30,
    'USD',
    '["Acceso a Mega Anuncios y Standard", "1 Banner clickeable (1500 clicks)", "2000 impresiones de banner", "Sistema de referidos hasta nivel 2", "Mínimo 150 visitas PTC/mes", "Mínimo 300 visualizaciones banner/mes", "Bonificación de 10% en ganancias PTC"]',
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
    'Paquete empresarial para máxima exposición y ganancias.',
    'enterprise',
    100.00,
    30,
    'USD',
    '["Acceso a todos los tipos de anuncios", "1 Banner clickeable (4000 clicks)", "6000 impresiones de banner", "Sistema de referidos hasta nivel 4", "Mínimo 400 visitas PTC/mes", "Mínimo 800 visualizaciones banner/mes", "Bonificación de 25% en ganancias PTC", "Soporte prioritario"]',
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
    'Paquete máximo para profesionales del marketing. Alcance ilimitado.',
    'custom',
    150.00,
    30,
    'USD',
    '["Acceso ilimitado a todos los anuncios", "1 Banner clickeable (10000 clicks)", "15000 impresiones de banner", "Sistema de referidos multinivel completo", "Mínimo 1000 visitas PTC/mes", "Mínimo 2000 visualizaciones banner/mes", "Bonificación de 50% en ganancias PTC", "API de gestión", "Asesoría dedicada"]',
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
) AS vals(name, description, package_type, price, duration_days, currency, features, min_ptc_visits, min_banner_views, included_ptc_ads, has_clickable_banner, banner_clicks_limit, banner_impressions_limit, daily_ptc_limit, max_ptc_ads, max_banner_ads, max_campaigns, ptc_reward_bonus, banner_reward_bonus, referral_bonus, is_active, display_order)
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = vals.name);

-- 4. ACTUALIZAR TABLA PTC_TASKS CON TIPO DE ANUNCIO
-- =============================================================================

ALTER TABLE ptc_tasks
ADD COLUMN IF NOT EXISTS ad_type ptc_ad_type DEFAULT 'standard_400',
ADD COLUMN IF NOT EXISTS is_demo_only BOOLEAN DEFAULT FALSE;

-- Actualizar anuncios existentes según recompensa
UPDATE ptc_tasks SET ad_type = 'mega' WHERE reward >= 1000;
UPDATE ptc_tasks SET ad_type = 'standard_600' WHERE reward >= 600 AND reward < 1000;
UPDATE ptc_tasks SET ad_type = 'standard_400' WHERE reward >= 400 AND reward < 600;
UPDATE ptc_tasks SET ad_type = 'mini' WHERE reward < 400;

-- 5. AGREGAR CAMPOS DEMO/REAL A PROFILES
-- =============================================================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS demo_balance DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS real_balance DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_demo_earned DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_donated DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_referrals_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS has_active_package BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS package_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS referral_link VARCHAR(255);

-- Actualizar referral_link basado en referral_code
UPDATE profiles SET referral_link = '/register?ref=' || referral_code WHERE referral_link IS NULL;

-- Renombrar balance a real_balance para mantener consistencia
-- (Los perfiles existentes mantienen su balance actual)

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

CREATE POLICY "Anyone can view active user levels"
  ON user_levels FOR SELECT
  USING (is_active = TRUE);

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
(2, 'Afiliado', 5, 14, 10, 1.10, 10, 'Has referido 5 personas. Gana el 10% y 10% más en cada PTC.'),
(3, 'Promotor', 15, 29, 15, 1.20, 15, '15 referidos alcanzados. Gana el 15% y 20% más en cada PTC.'),
(4, 'Influencer', 30, 49, 20, 1.30, 25, '30 referidos. Gana el 20% y 30% más en cada PTC.'),
(5, 'Embajador', 50, 99, 25, 1.50, 50, '50 referidos. Gana el 25% y 50% más en cada PTC.'),
(6, 'Líder', 100, 199, 30, 2.00, 75, '100 referidos. Gana el 30% y el doble en cada PTC.'),
(7, 'Maestro', 200, 499, 35, 2.50, 100, '200 referidos. Gana el 35% y 2.5x en cada PTC.'),
(8, 'VIP', 500, NULL, 50, 3.00, 200, '500+ referidos. Gana el 50% y 3x en cada PTC. Acceso VIP.');

-- 7. CREAR TABLA DE DONACIONES
-- =============================================================================

CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  source VARCHAR(50) NOT NULL, -- 'ptc_click', 'referral', 'banner_click', 'bonus'
  source_id UUID, -- ID de la transacción origen
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own donations"
  ON donations FOR SELECT
  USING (user_id = auth.uid());

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

-- Verificar si la tabla ya existe
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'package_banners') THEN
    -- Crear tabla si no existe
    CREATE TABLE package_banners (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
      user_package_id UUID REFERENCES user_packages(id) ON DELETE CASCADE,
      name VARCHAR(255),
      image_url TEXT NOT NULL,
      target_url TEXT NOT NULL,
      clicks_limit INTEGER NOT NULL,
      impressions_limit INTEGER NOT NULL,
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
    
    -- Habilitar RLS
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
  ELSE
    -- Agregar columnas faltantes si la tabla ya existe
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'package_banners' AND column_name = 'user_package_id') THEN
      ALTER TABLE package_banners ADD COLUMN user_package_id UUID REFERENCES user_packages(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'package_banners' AND column_name = 'banner_clicks_limit') THEN
      ALTER TABLE package_banners ADD COLUMN clicks_limit INTEGER NOT NULL DEFAULT 1000;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'package_banners' AND column_name = 'banner_impressions_limit') THEN
      ALTER TABLE package_banners ADD COLUMN impressions_limit INTEGER NOT NULL DEFAULT 1000;
    END IF;
  END IF;
END $;

-- 9. CREAR FUNCIÓN PARA CALCULAR DONACIÓN (1%)
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_donation(amount DECIMAL(10,2))
RETURNS DECIMAL(10,2) AS $$
BEGIN
  RETURN ROUND(amount * 0.01, 2);
END;
$$ LANGUAGE plpgsql;

-- 10. CREAR FUNCIÓN PARA REGISTRAR GANANCIA CON DONACIÓN
-- =============================================================================

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
  -- Verificar si el usuario tiene paquete activo
  SELECT has_active_package INTO user_has_package
  FROM profiles WHERE id = p_user_id;

  -- Calcular donación (1%)
  donation_amount := calculate_donation(p_amount);
  net_amount := p_amount - donation_amount;

  -- Registrar donación
  INSERT INTO donations (user_id, amount, source, source_id, description)
  VALUES (p_user_id, donation_amount, p_source, p_source_id,
          COALESCE(p_description, 'Donación del 1% de ganancia'));

  -- Actualizar total donado del usuario
  UPDATE profiles
  SET total_donated = total_donated + donation_amount
  WHERE id = p_user_id;

  -- Retornar el monto neto para agregar al balance
  RETURN jsonb_build_object(
    'gross_amount', p_amount,
    'donation_amount', donation_amount,
    'net_amount', net_amount,
    'has_active_package', user_has_package
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. CREAR FUNCIÓN PARA ACTUALIZAR NIVEL DEL USUARIO
-- =============================================================================

CREATE OR REPLACE FUNCTION update_user_level()
RETURNS TRIGGER AS $$
DECLARE
  referral_count INTEGER;
  new_level INTEGER;
BEGIN
  -- Contar referidos activos del usuario
  SELECT COUNT(*) INTO referral_count
  FROM profiles
  WHERE referred_by = NEW.id AND is_active = TRUE;

  -- Encontrar el nivel correspondiente
  SELECT level INTO new_level
  FROM user_levels
  WHERE min_referrals <= referral_count
    AND (max_referrals IS NULL OR max_referrals >= referral_count)
    AND is_active = TRUE
  ORDER BY level DESC
  LIMIT 1;

  -- Actualizar nivel si cambió
  IF new_level IS NOT NULL AND NEW.level != new_level THEN
    NEW.level := new_level;
    NEW.total_referrals_count := referral_count;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger para actualizar nivel automáticamente
DROP TRIGGER IF EXISTS trg_update_user_level ON profiles;
CREATE TRIGGER trg_update_user_level
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_level();

-- 12. CREAR FUNCIÓN PARA VALIDAR CÓDIGO DE REFERIDO
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_referral_code(code VARCHAR)
RETURNS JSONB AS $$
DECLARE
  referrer profiles%ROWTYPE;
BEGIN
  -- Buscar el perfil con ese código de referido
  SELECT * INTO referrer
  FROM profiles
  WHERE referral_code = code;

  IF referrer.id IS NULL THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'Código de referido no válido'
    );
  END IF;

  IF referrer.is_active = FALSE THEN
    RETURN jsonb_build_object(
      'valid', FALSE,
      'error', 'El referidor no está activo'
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

-- 13. CREAR FUNCIÓN PARA ACTIVAR PAQUETE DE USUARIO
-- =============================================================================

-- Primero verificar si la función ya existe y eliminarla
DROP FUNCTION IF EXISTS activate_user_package(UUID, UUID);

CREATE OR REPLACE FUNCTION activate_user_package(
  p_user_id UUID,
  p_package_id UUID
)
RETURNS BOOLEAN AS $
DECLARE
  v_package RECORD;
  v_user_package_id UUID;
  v_package_exists BOOLEAN;
BEGIN
  -- Verificar si el paquete existe
  SELECT EXISTS(SELECT 1 FROM packages WHERE id = p_package_id) INTO v_package_exists;
  
  IF NOT v_package_exists THEN
    RETURN FALSE;
  END IF;
  
  -- Obtener información del paquete
  SELECT * INTO v_package FROM packages WHERE id = p_package_id;

  -- Crear el registro de paquete del usuario
  INSERT INTO user_packages (
    user_id, package_id, package_name, start_date, end_date, status
  )
  VALUES (
    p_user_id, p_package_id, v_package.name, NOW(),
    NOW() + (v_package.duration_days || ' days')::INTERVAL, 'active'
  )
  RETURNING id INTO v_user_package_id;

  -- Actualizar perfil del usuario
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
$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. CREAR ÍNDICES ADICIONALES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_ptc_tasks_ad_type ON ptc_tasks(ad_type);
CREATE INDEX IF NOT EXISTS idx_ptc_tasks_is_demo_only ON ptc_tasks(is_demo_only);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_link ON profiles(referral_link);
CREATE INDEX IF NOT EXISTS idx_profiles_has_active_package ON profiles(has_active_package);
CREATE INDEX IF NOT EXISTS idx_donations_user_id ON donations(user_id);
CREATE INDEX IF NOT EXISTS idx_package_banners_user_id ON package_banners(user_id);
CREATE INDEX IF NOT EXISTS idx_package_banners_status ON package_banners(status);

-- 15. CREAR VISTA PARA ESTADÍSTICAS DEL SISTEMA
-- =============================================================================

CREATE OR REPLACE VIEW system_stats AS
SELECT
  (SELECT COUNT(*) FROM profiles) as total_users,
  (SELECT COUNT(*) FROM profiles WHERE has_active_package = TRUE) as active_advertisers,
  (SELECT COUNT(*) FROM profiles WHERE has_active_package = FALSE) as free_users,
  (SELECT COUNT(*) FROM ptc_tasks WHERE status = 'active') as active_ptc_tasks,
  (SELECT COUNT(*) FROM banner_ads WHERE status = 'active') as active_banners,
  (SELECT SUM(real_balance) FROM profiles) as total_real_balance,
  (SELECT SUM(demo_balance) FROM profiles) as total_demo_balance,
  (SELECT SUM(amount) FROM donations) as total_donations,
  (SELECT COUNT(*) FROM referrals) as total_referral_relationships;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
