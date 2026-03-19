-- ============================================================
-- 039: Trading Bot AI packages system
-- ============================================================

-- Catálogo de paquetes de Trading Bot
CREATE TABLE IF NOT EXISTS trading_bot_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  monthly_return_pct NUMERIC(5,2) NOT NULL DEFAULT 2.0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Asignaciones de paquetes de trading a usuarios (activadas por admin)
CREATE TABLE IF NOT EXISTS user_trading_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES trading_bot_packages(id) ON DELETE CASCADE,
  activated_by UUID REFERENCES profiles(id),
  activated_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_trading_packages_user_id ON user_trading_packages(user_id);
CREATE INDEX IF NOT EXISTS idx_user_trading_packages_active ON user_trading_packages(user_id, is_active);

-- RLS
ALTER TABLE trading_bot_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_trading_packages ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer el catálogo de paquetes
CREATE POLICY "public_read_trading_bot_packages"
  ON trading_bot_packages FOR SELECT USING (true);

-- Admins y devs pueden gestionar el catálogo
CREATE POLICY "admins_manage_trading_bot_packages"
  ON trading_bot_packages FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

-- Usuarios pueden ver sus propios paquetes activos
CREATE POLICY "users_read_own_trading_packages"
  ON user_trading_packages FOR SELECT
  USING (auth.uid() = user_id);

-- Admins y devs pueden gestionar todas las asignaciones
CREATE POLICY "admins_manage_user_trading_packages"
  ON user_trading_packages FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

-- Datos iniciales: paquetes de trading (mismos que el componente existente)
INSERT INTO trading_bot_packages (name, price_usd, monthly_return_pct, display_order) VALUES
  ('JADE',            50,    2.0, 1),
  ('PERLA',          100,    2.5, 2),
  ('ZAFIRO',         200,    3.0, 3),
  ('RUBY',           500,    3.5, 4),
  ('ESMERALDA',     1000,    4.0, 5),
  ('DIAMANTE',      3000,    4.5, 6),
  ('DIAMANTE AZUL', 5000,    5.0, 7),
  ('DIAMANTE NEGRO',7000,    5.5, 8),
  ('DIAMANTE CORONA',10000,  6.0, 9)
ON CONFLICT DO NOTHING;
