-- =============================================================================
-- Fix: Asignar paquete a usuario desde admin
-- Crea función SECURITY DEFINER que bypasa RLS + arregla políticas
-- =============================================================================

-- 1. Asegurar columnas necesarias en user_packages
ALTER TABLE user_packages ADD COLUMN IF NOT EXISTS package_name VARCHAR(100);

-- 2. Arreglar políticas RLS de user_packages para admin INSERT
-- El problema: FOR ALL + USING sin WITH CHECK no cubre INSERT en algunas versiones
DROP POLICY IF EXISTS "Admins can manage all user packages" ON user_packages;
DROP POLICY IF EXISTS "Admins can manage all user_packages" ON user_packages;

CREATE POLICY "Admins can manage all user_packages"
  ON user_packages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );

-- 3. Crear/reemplazar función para activar paquete (SECURITY DEFINER bypasa RLS)
CREATE OR REPLACE FUNCTION activate_user_package(
  p_user_id UUID,
  p_package_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_package RECORD;
  v_end_date TIMESTAMPTZ;
BEGIN
  -- Verificar que el paquete existe
  SELECT * INTO v_package FROM packages WHERE id = p_package_id;
  IF v_package.id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_end_date := NOW() + (v_package.duration_days || ' days')::INTERVAL;

  -- Insertar en user_packages
  INSERT INTO user_packages (user_id, package_id, package_name, start_date, end_date, status)
  VALUES (p_user_id, p_package_id, v_package.name, NOW(), v_end_date, 'active');

  -- Actualizar perfil: paquete activo + rol advertiser
  UPDATE profiles
  SET
    has_active_package = TRUE,
    current_package_id = p_package_id,
    package_started_at = NOW(),
    package_expires_at = v_end_date,
    role = 'advertiser',
    updated_at = NOW()
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- FIN
-- =============================================================================
