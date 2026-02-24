-- =============================================================================
-- Migración 008: Fix registro de usuarios - Trigger handle_new_user
-- Corrige el trigger para leer todos los datos del metadata del usuario
-- y crear el perfil completo en la misma transacción del registro.
--
-- Problema: la versión simplificada del trigger (scripts/part1-function.sql)
-- no incluía referral_code (NOT NULL) → todos los registros fallaban.
-- =============================================================================

-- 1. Agregar columnas faltantes a profiles (solo si no existen)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city TEXT;

-- 2. Hacer referral_code nullable para evitar bloquear el registro si el
--    trigger falla por cualquier razón inesperada. El trigger siempre lo setea.
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ALTER COLUMN referral_code DROP NOT NULL;

-- 3. Recrear handle_new_user con soporte completo de raw_user_meta_data
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username      TEXT;
  v_base_username TEXT;
  v_referral_code TEXT;
  v_referrer_id   UUID;
  v_referrer_code TEXT;
  v_counter       INTEGER := 0;
BEGIN
  -- Leer código de referido del metadata
  v_referrer_code := TRIM(COALESCE(NEW.raw_user_meta_data->>'referral_code', ''));

  -- Construir username base desde metadata o email
  v_base_username := COALESCE(
    NULLIF(TRIM(regexp_replace(LOWER(COALESCE(NEW.raw_user_meta_data->>'username', '')), '[^a-z0-9_]', '', 'g')), ''),
    NULLIF(TRIM(regexp_replace(LOWER(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g')), ''),
    'user'
  );
  v_base_username := LEFT(v_base_username, 30);

  -- Garantizar username único
  v_username := v_base_username;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = v_username) LOOP
    v_counter := v_counter + 1;
    v_username := LEFT(v_base_username, 25) || v_counter::TEXT;
  END LOOP;

  -- referral_code = username (estrategia vigente del proyecto)
  v_referral_code := v_username;
  -- Resolver colisión de referral_code (raro pero posible)
  WHILE EXISTS (SELECT 1 FROM profiles WHERE referral_code = v_referral_code AND id != NEW.id) LOOP
    v_counter := v_counter + 1;
    v_referral_code := LEFT(v_base_username, 25) || v_counter::TEXT;
  END LOOP;

  -- Buscar referidor por código (case-insensitive)
  IF v_referrer_code != '' THEN
    SELECT id INTO v_referrer_id
    FROM profiles
    WHERE LOWER(referral_code) = LOWER(v_referrer_code)
    LIMIT 1;
  END IF;

  -- Insertar perfil con todos los datos del metadata
  INSERT INTO profiles (
    id, email, username, full_name, role, is_active,
    referral_code, referral_link, referred_by,
    phone, country, country_code, department, city
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_username,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), ''),
    'guest',
    FALSE,
    v_referral_code,
    '/ref/' || v_referral_code,
    v_referrer_id,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'country', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'country_code', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'department', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'city', '')), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    username     = EXCLUDED.username,
    full_name    = COALESCE(EXCLUDED.full_name,    profiles.full_name),
    referral_code = COALESCE(EXCLUDED.referral_code, profiles.referral_code),
    referral_link = COALESCE(EXCLUDED.referral_link, profiles.referral_link),
    referred_by  = COALESCE(EXCLUDED.referred_by,   profiles.referred_by),
    phone        = COALESCE(EXCLUDED.phone,         profiles.phone),
    country      = COALESCE(EXCLUDED.country,       profiles.country),
    country_code = COALESCE(EXCLUDED.country_code,  profiles.country_code),
    department   = COALESCE(EXCLUDED.department,    profiles.department),
    city         = COALESCE(EXCLUDED.city,          profiles.city),
    updated_at   = NOW();

  -- Registrar relación de referido
  IF v_referrer_id IS NOT NULL THEN
    INSERT INTO referrals (referrer_id, referred_id, referred_username, referred_level)
    VALUES (v_referrer_id, NEW.id, v_username, 1)
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- No bloquear la creación del usuario si el perfil falla por algo inesperado
  RAISE WARNING '[handle_new_user] Error al crear perfil para usuario %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Recrear el trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- FIN - Ejecutar en el SQL Editor de Supabase
-- =============================================================================
