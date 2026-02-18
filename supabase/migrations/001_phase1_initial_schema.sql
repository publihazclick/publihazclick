-- =============================================================================
-- PublihazClick - Fase 1: Sistema de Usuarios, Perfiles y Referidos
-- Ejecutar este script en el SQL Editor de Supabase
-- =============================================================================

-- 1. CREAR ENUMS
-- =============================================================================

-- Enum para roles de usuario
CREATE TYPE user_role AS ENUM ('dev', 'admin', 'guest', 'advertiser');

-- Enum para estado de tareas PTC
CREATE TYPE task_status AS ENUM ('active', 'paused', 'completed');

-- Enum para estado de campañas
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed');

-- Enum para estado de retiros
CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'completed');


-- 2. CREAR TABLA PROFILES
-- =============================================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE NOT NULL,
  referral_code VARCHAR(8) UNIQUE NOT NULL,
  referred_by UUID REFERENCES profiles(id),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  avatar_url TEXT,
  role user_role DEFAULT 'guest',
  level INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT FALSE,
  balance DECIMAL(12,2) DEFAULT 0,
  pending_balance DECIMAL(12,2) DEFAULT 0,
  total_earned DECIMAL(12,2) DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  referral_earnings DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para profiles
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );


-- 3. CREAR TABLA DE REFERIDOS
-- =============================================================================

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  referred_username VARCHAR(50),
  referred_level INTEGER DEFAULT 1,
  earnings DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referred_id)
);

-- Habilitar RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own referrals"
  ON referrals FOR SELECT
  USING (referrer_id = auth.uid());

CREATE POLICY "Users can insert their own referrals"
  ON referrals FOR INSERT
  WITH CHECK (referrer_id = auth.uid());


-- 4. CREAR TABLA PTC TASKS
-- =============================================================================

CREATE TABLE ptc_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  reward DECIMAL(10,2) NOT NULL,
  duration INTEGER DEFAULT 15,
  daily_limit INTEGER DEFAULT 1000,
  total_clicks INTEGER DEFAULT 0,
  status task_status DEFAULT 'active',
  advertiser_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS para PTC Tasks
ALTER TABLE ptc_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active PTC tasks"
  ON ptc_tasks FOR SELECT
  USING (status = 'active');

CREATE POLICY "Advertisers can manage their PTC tasks"
  ON ptc_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'advertiser'
    )
  );


-- 5. CREAR TABLA PTC CLICKS
-- =============================================================================

CREATE TABLE ptc_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  task_id UUID REFERENCES ptc_tasks(id),
  reward_earned DECIMAL(10,2) NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ptc_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own clicks"
  ON ptc_clicks FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own clicks"
  ON ptc_clicks FOR INSERT
  WITH CHECK (user_id = auth.uid());


-- 6. CREAR TABLA CAMPAIGNS
-- =============================================================================

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID REFERENCES profiles(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  campaign_type VARCHAR(50) DEFAULT 'ptc',
  budget DECIMAL(12,2) NOT NULL,
  daily_budget DECIMAL(12,2),
  bid_per_click DECIMAL(10,2) NOT NULL,
  status campaign_status DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Advertisers can manage their campaigns"
  ON campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'advertiser'
    )
  );

CREATE POLICY "Admins can view all campaigns"
  ON campaigns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );


-- 7. CREAR TABLA WITHDRAWAL REQUESTS
-- =============================================================================

CREATE TABLE withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(50) NOT NULL,
  details JSONB,
  status withdrawal_status DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own withdrawal requests"
  ON withdrawal_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create withdrawal requests"
  ON withdrawal_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all withdrawal requests"
  ON withdrawal_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );


-- 8. CREAR FUNCIONES Y TRIGGERS
-- =============================================================================

-- Función para generar código de referido único
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(8) AS $$
DECLARE
  code VARCHAR(8);
BEGIN
  LOOP
    code := upper(substring(md5(random()::text) from 1 for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Función para generar username único
CREATE OR REPLACE FUNCTION generate_unique_username(base_username VARCHAR)
RETURNS VARCHAR(50) AS $$
DECLARE
  final_username VARCHAR(50);
  counter INTEGER := 0;
  temp_username VARCHAR(50);
BEGIN
  temp_username := substring(base_username from 1 for 30);
  
  -- Limpiar caracteres no válidos
  temp_username := regexp_replace(temp_username, '[^a-zA-Z0-9_]', '', 'g');
  
  IF temp_username IS NULL OR temp_username = '' THEN
    temp_username := 'user';
  END IF;
  
  final_username := temp_username;
  
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := substring(temp_username from 1 for 25) || counter::TEXT;
  END LOOP;
  
  RETURN final_username;
END;
$$ LANGUAGE plpgsql;

-- Trigger para crear perfil automáticamente
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_username VARCHAR(50);
  new_code VARCHAR(8);
  referral_id UUID;
BEGIN
  -- Generar username único desde email
  new_username := generate_unique_username(split_part(NEW.email, '@', 1));
  
  -- Generar código de referido
  new_code := generate_referral_code();
  
  -- Buscar si hay un referidor por el código en la URL (se maneja en app)
  referral_id := NULL;
  
  INSERT INTO profiles (id, username, referral_code, referred_by, email, role, is_active)
  VALUES (NEW.id, new_username, new_code, referral_id, NEW.email, 'guest', FALSE);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- 9. CREAR ÍNDICES PARA MEJORAR RENDIMIENTO
-- =============================================================================

CREATE INDEX idx_profiles_referral_code ON profiles(referral_code);
CREATE INDEX idx_profiles_referred_by ON profiles(referred_by);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_ptc_tasks_advertiser_id ON ptc_tasks(advertiser_id);
CREATE INDEX idx_ptc_clicks_user_id ON ptc_clicks(user_id);
CREATE INDEX idx_campaigns_advertiser_id ON campaigns(advertiser_id);
CREATE INDEX idx_withdrawal_requests_user_id ON withdrawal_requests(user_id);


-- 10. CREAR USUARIO ADMIN INICIAL (EJECUTAR MANUALMENTE SI ES NECESARIO)
-- =============================================================================
-- Nota: Este es un ejemplo. El usuario admin debe ser creado desde la app
-- después de que el primer usuario se registre manualmente en Supabase.

-- INSERT INTO profiles (id, username, referral_code, email, role, is_active)
-- VALUES (
--   'USER_ID_FROM_AUTH',  -- Reemplazar con el ID del usuario de auth.users
--   'admin',
--   'ADMIN001',
--   'admin@publihazclick.com',
--   'admin',
--   TRUE
-- );


-- =============================================================================
-- FIN DEL SCRIPT
-- Ejecutar en orden: enums -> tablas -> funciones -> triggers -> índices
-- =============================================================================
