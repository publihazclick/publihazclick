-- =============================================================================
-- PublihazClick - Fase 2: Actualizar Sistema de Códigos de Referido
-- Nuevo formato: username + 5 dígitos aleatorios + año
-- Ejemplo: juan12345-2025
-- =============================================================================

-- 1. ACTUALIZAR LA FUNCIÓN DE GENERACIÓN DE CÓDIGO DE REFERIDO
-- =============================================================================

-- Función para generar código de referido único con nuevo formato
-- Formato: username + 5 digitos aleatorios + año
CREATE OR REPLACE FUNCTION generate_referral_code(new_username VARCHAR)
RETURNS VARCHAR(20) AS $$
DECLARE
  code VARCHAR(20);
  random_digits VARCHAR(5);
  current_year VARCHAR(4);
  final_code VARCHAR(20);
BEGIN
  -- Obtener el año actual
  current_year := EXTRACT(YEAR FROM NOW())::VARCHAR;
  
  -- Limpiar el username (solo letras, números y guiones bajos)
  new_username := regexp_replace(COALESCE(new_username, 'user'), '[^a-zA-Z0-9_]', '', 'g');
  
  -- Si está vacío, usar 'user'
  IF new_username IS NULL OR new_username = '' THEN
    new_username := 'user';
  END IF;
  
  -- Limitar username a 8 caracteres
  new_username := substring(new_username from 1 for 8);
  
  LOOP
    -- Generar 5 dígitos aleatorios
    random_digits := LPAD(FLOOR(random() * 100000)::VARCHAR, 5, '0');
    
    -- Crear el código: username + digitos + año
    final_code := lower(new_username || random_digits || '-' || current_year);
    
    -- Verificar que no exista
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM profiles 
      WHERE referral_code = final_code
    );
  END LOOP;
  
  RETURN final_code;
END;
$$ LANGUAGE plpgsql;

-- 2. ACTUALIZAR EL TRIGGER DE NUEVO USUARIO
-- =============================================================================

-- Función actualizada para handle_new_user con nuevo formato de código
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_username VARCHAR(50);
  new_code VARCHAR(20);
  referral_id UUID;
  referred_code VARCHAR(20);
BEGIN
  -- Generar username único desde email
  new_username := generate_unique_username(split_part(NEW.email, '@', 1));
  
  -- Generar código de referido con el nuevo formato (username + 5 digitos + año)
  new_code := generate_referral_code(new_username);
  
  -- Buscar si hay un referidor por el código en la URL (se maneja en app)
  referral_id := NULL;
  
  INSERT INTO profiles (id, username, referral_code, referred_by, email, role, is_active)
  VALUES (NEW.id, new_username, new_code, referral_id, NEW.email, 'guest', FALSE);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear el trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. ACTUALIZAR ÍNDICES
-- =============================================================================

-- Actualizar el índice para el nuevo tamaño del código
DROP INDEX IF EXISTS idx_profiles_referral_code;
CREATE INDEX idx_profiles_referral_code ON profiles(referral_code);

-- 4. NOTA IMPORTANTE PARA LA APLICACIÓN ANGULAR
-- =============================================================================
-- El código de referido ahora tendrá el formato: usernameXXXXX-YYYY
-- Ejemplo: juan12345-2025
--
-- Para validar un código de referido en la aplicación:
-- 1. El código debe tener formato: username + 5 digitos + '-' + año (4 digitos)
-- 2. La validación debe buscar en la tabla profiles por referral_code
-- 3. El sistema de referidos ya está implementado en:
--    - src/app/core/services/profile.service.ts (validateReferralCode)
--    - src/app/core/services/auth.service.ts (registerWithReferral)
--    - src/app/features/auth/components/register/register.component.ts
--
-- El enlace de referido será:
-- https://tusitio.com/register/username12345-2025
--
-- Al hacer clic, el componente RegisterComponent:
-- 1. Extrae el código de la URL
-- 2. Lo valida contra la base de datos
-- 3. Al registrar, vincula al nuevo usuario con el referidor

-- =============================================================================
-- FIN DEL SCRIPT
-- =============================================================================
