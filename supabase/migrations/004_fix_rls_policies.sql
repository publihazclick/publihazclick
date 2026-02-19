-- =============================================================================
-- PublihazClick - Fix: Corregir políticas RLS y crear tabla activity_logs
-- =============================================================================

-- 1. CORREGIR POLÍTICAS RLS DE PROFILES (Eliminar recurrencia infinita)
-- =============================================================================

-- Eliminar políticas problemáticas
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

-- Crear función auxiliar para verificar rol de admin
CREATE OR REPLACE FUNCTION is_admin_or_dev(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id AND role IN ('admin', 'dev')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Nueva política para que admins puedan ver todos los perfiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin_or_dev(auth.uid()));

-- Nueva política para que admins puedan actualizar todos los perfiles  
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin_or_dev(auth.uid()));

-- 2. CREAR TABLA ACTIVITY_LOGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crear índice para búsquedas por usuario
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- RLS para activity_logs
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Política: usuarios pueden ver sus propios logs
CREATE POLICY "Users can view own activity logs"
  ON activity_logs FOR SELECT
  USING (user_id = auth.uid());

-- Política: admins pueden ver todos los logs
CREATE POLICY "Admins can view all activity logs"
  ON activity_logs FOR SELECT
  USING (is_admin_or_dev(auth.uid()));

-- Política: el sistema puede insertar logs
CREATE POLICY "System can insert activity logs"
  ON activity_logs FOR INSERT
  WITH CHECK (true);

-- 3. CREAR FUNCIÓN PARA REGISTRAR ACTIVIDAD
-- =============================================================================

CREATE OR REPLACE FUNCTION log_activity(
  p_user_id UUID,
  p_action VARCHAR,
  p_entity_type VARCHAR,
  p_entity_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
