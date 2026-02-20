-- =============================================================================
-- PublihazClick - Fase 2: Paquetes, Banners y Mejoras al Admin
-- =============================================================================

-- 1. CREAR ENUMS ADICIONALES
-- =============================================================================

-- Enum para tipo de paquete
CREATE TYPE package_type AS ENUM ('basic', 'premium', 'enterprise', 'custom');

-- Enum para estado del paquete del usuario
CREATE TYPE user_package_status AS ENUM ('active', 'expired', 'cancelled');

-- Enum para posición del banner
CREATE TYPE banner_position AS ENUM ('header', 'sidebar', 'footer', 'interstitial');

-- Enum para estado del banner
CREATE TYPE banner_status AS ENUM ('active', 'paused', 'completed', 'rejected');


-- 2. CREAR TABLA PACKAGES
-- =============================================================================

CREATE TABLE packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  package_type package_type NOT NULL DEFAULT 'basic',
  price DECIMAL(10,2) NOT NULL,
  duration_days INTEGER NOT NULL,
  features JSONB DEFAULT '[]',
  -- Límites de vistas incluidas
  min_ptc_visits INTEGER DEFAULT 0,
  min_banner_views INTEGER DEFAULT 0,
  -- Límites incluidos en el paquete
  max_ptc_ads INTEGER DEFAULT 5,
  max_banner_ads INTEGER DEFAULT 2,
  max_campaigns INTEGER DEFAULT 3,
  included_ptc_ads INTEGER DEFAULT 0,
  has_clickable_banner BOOLEAN DEFAULT FALSE,
  banner_clicks_limit INTEGER DEFAULT 0,
  banner_impressions_limit INTEGER DEFAULT 0,
  daily_ptc_limit INTEGER DEFAULT 0,
  ptc_reward_bonus DECIMAL(5,2) DEFAULT 0,
  banner_reward_bonus DECIMAL(5,2) DEFAULT 0,
  referral_bonus DECIMAL(5,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para packages
CREATE POLICY "Anyone can view active packages"
  ON packages FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Admins can manage packages"
  ON packages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );


-- 3. CREAR TABLA USER_PACKAGES
-- =============================================================================

CREATE TABLE user_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  package_id UUID REFERENCES packages(id),
  package_name VARCHAR(100),
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ NOT NULL,
  status user_package_status DEFAULT 'active',
  auto_renew BOOLEAN DEFAULT FALSE,
  payment_method VARCHAR(50),
  payment_id VARCHAR(255),
  amount_paid DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE user_packages ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para user_packages
CREATE POLICY "Users can view their own packages"
  ON user_packages FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own packages"
  ON user_packages FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all user packages"
  ON user_packages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );


-- 4. CREAR TABLA BANNER_ADS
-- =============================================================================

CREATE TABLE banner_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID REFERENCES profiles(id),
  campaign_id UUID REFERENCES campaigns(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  url TEXT NOT NULL,
  position banner_position NOT NULL DEFAULT 'sidebar',
  impressions_limit INTEGER DEFAULT 10000,
  clicks_limit INTEGER DEFAULT 1000,
  daily_impressions INTEGER DEFAULT 0,
  daily_clicks INTEGER DEFAULT 0,
  total_impressions INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  reward DECIMAL(10,2) DEFAULT 0,
  ctr DECIMAL(5,2) DEFAULT 0,
  status banner_status DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE banner_ads ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para banner_ads
CREATE POLICY "Anyone can view active banner ads"
  ON banner_ads FOR SELECT
  USING (status = 'active');

CREATE POLICY "Advertisers can manage their banner ads"
  ON banner_ads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'advertiser'
    )
  );

CREATE POLICY "Admins can manage all banner ads"
  ON banner_ads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );


-- 5. CREAR TABLA BANNER_AD_CLICKS
-- =============================================================================

CREATE TABLE banner_ad_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  banner_ad_id UUID REFERENCES banner_ads(id),
  reward_earned DECIMAL(10,2) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE banner_ad_clicks ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own banner clicks"
  ON banner_ad_clicks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own banner clicks"
  ON banner_ad_clicks FOR INSERT
  WITH CHECK (user_id = auth.uid());


-- 6. CREAR ÍNDICES
-- =============================================================================

CREATE INDEX idx_user_packages_user_id ON user_packages(user_id);
CREATE INDEX idx_user_packages_package_id ON user_packages(package_id);
CREATE INDEX idx_user_packages_status ON user_packages(status);
CREATE INDEX idx_banner_ads_advertiser_id ON banner_ads(advertiser_id);
CREATE INDEX idx_banner_ads_position ON banner_ads(position);
CREATE INDEX idx_banner_ads_status ON banner_ads(status);
CREATE INDEX idx_banner_ad_clicks_user_id ON banner_ad_clicks(user_id);
CREATE INDEX idx_banner_ad_clicks_banner_id ON banner_ad_clicks(banner_ad_id);


-- 7. INSERTAR PAQUETES POR DEFECTO
-- =============================================================================

INSERT INTO packages (name, description, package_type, price, duration_days, features, min_ptc_visits, min_banner_views, max_ptc_ads, max_banner_ads, max_campaigns, included_ptc_ads, has_clickable_banner, banner_clicks_limit, banner_impressions_limit, daily_ptc_limit, ptc_reward_bonus, banner_reward_bonus, referral_bonus, display_order)
VALUES 
(
  'Básico',
  'Perfecto para comenzar tu estrategia de publicidad online.',
  'basic',
  25,
  30,
  '["20.000 vistas banner mensuales", "9.000 vistas post", "120 vistas PTC", "Reporte básico de métricas", "Segmentación por país", "Duración: 30 días"]',
  120,
  20000,
  5,
  1,
  1,
  5,
  true,
  9000,
  20000,
  10,
  5,
  0,
  5,
  1
),
(
  'Básico Plus',
  'Plan recomendado para maximizar tu alcance publicitario.',
  'premium',
  50,
  30,
  '["40.000 vistas banner mensuales", "20.000 vistas post", "250 vistas PTC", "Reporte detallado de conversiones", "Segmentación avanzada", "Banner en rotación principal", "Duración: 30 días"]',
  250,
  40000,
  15,
  3,
  3,
  15,
  true,
  20000,
  40000,
  20,
  10,
  5,
  10,
  2
),
(
  'Avanzado',
  'Para profesionales que buscan resultados avanzados.',
  'enterprise',
  100,
  30,
  '["80.000 vistas banner mensuales", "40.000 vistas post", "500 vistas PTC", "Analytics en tiempo real", "Segmentación premium por intereses", "Prioridad en ubicaciones", "A/B Testing de anuncios", "Soporte prioritario 24/7", "Duración: 30 días"]',
  500,
  80000,
  40,
  10,
  10,
  40,
  true,
  40000,
  80000,
  40,
  25,
  15,
  20,
  3
),
(
  'Avanzado Pro',
  'El paquete máximo con beneficios empresariales exclusivos.',
  'custom',
  150,
  30,
  '["120.000 vistas banner mensuales", "60.000 vistas post", "750 vistas PTC", "Dashboard empresarial completo", "Consultoría de marketing incluida", "Videos promocionales destacados", "Campañas personalizadas multicanal", "API de integración avanzada", "Gerente de cuenta dedicado", "Duración: 30 días"]',
  750,
  120000,
  999999,
  999999,
  999999,
  100,
  true,
  60000,
  120000,
  60,
  50,
  25,
  30,
  4
);


-- 8. AGREGAR CAMPOS A PROFILES PARA MEJOR RASTREO
-- =============================================================================

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS current_package_id UUID REFERENCES packages(id),
ADD COLUMN IF NOT EXISTS package_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS total_referrals INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_clicks INTEGER DEFAULT 0;

CREATE INDEX idx_profiles_package ON profiles(current_package_id);


-- 9. CREAR VISTA PARA VER PAQUETES DE USUARIOS (para admin)
-- =============================================================================

CREATE OR REPLACE VIEW admin_user_packages_view AS
SELECT 
  up.id,
  up.user_id,
  p.username,
  p.email,
  up.package_name,
  up.start_date,
  up.end_date,
  up.status,
  up.auto_renew,
  up.amount_paid,
  up.payment_method,
  up.created_at
FROM user_packages up
LEFT JOIN profiles p ON up.user_id = p.id
ORDER BY up.created_at DESC;


-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
