-- =============================================================================
-- Migración 119: Corregir is_active para usuarios con paquete pagado
--
-- Problema:
--   - El trigger handle_new_user (migración 008) inserta profiles con
--     is_active = FALSE.
--   - La edge function register-with-referral intenta ponerlo en TRUE pero
--     tiene un filtro .is("referred_by", null) que nunca matchea porque el
--     trigger ya puso referred_by.
--   - Las funciones de activación/renovación de paquete (activate_user_package,
--     renew_package_with_balance) no tocan is_active.
--   => Resultado: usuarios pagan paquete, reciben role='advertiser' y
--      has_active_package=TRUE, pero quedan marcados is_active=FALSE ("Inactivo"
--      en admin), lo que genera confusión.
--
-- Solución (quirúrgica, no toca saldos ni otros campos):
--   1. Backfill: activar solo usuarios con has_active_package = TRUE que
--      estén marcados FALSE. No toca usuarios sin paquete (preserva las
--      desactivaciones legítimas hechas por el admin a cuentas no pagadoras).
--   2. Trigger BEFORE UPDATE: al transicionar has_active_package de FALSE→TRUE,
--      forzar is_active = TRUE. Captura compras y renovaciones futuras sin
--      modificar las funciones existentes.
--   3. Recrear handle_new_user con is_active = TRUE en el INSERT (preserva el
--      resto de la lógica idéntica a la migración 008).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Backfill: solo usuarios con paquete pagado vigente que están inactivos
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE profiles
   SET is_active  = TRUE,
       updated_at = NOW()
 WHERE has_active_package = TRUE
   AND is_active = FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Trigger BEFORE UPDATE: activar automáticamente al activar un paquete
--    Se dispara SOLO cuando has_active_package pasa de FALSE/NULL a TRUE.
--    No interfiere con desactivaciones manuales posteriores del admin:
--    el admin puede poner is_active=FALSE después y el trigger no lo tocará
--    (porque OLD.has_active_package ya será TRUE, no hay transición).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_profile_on_package_purchase()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(OLD.has_active_package, FALSE) = FALSE
     AND NEW.has_active_package = TRUE
     AND NEW.is_active IS DISTINCT FROM TRUE THEN
    NEW.is_active := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activate_profile_on_package_purchase ON profiles;
CREATE TRIGGER trg_activate_profile_on_package_purchase
  BEFORE UPDATE OF has_active_package ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.activate_profile_on_package_purchase();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Corregir handle_new_user para que nuevos registros arranquen activos.
--    Idéntica a la versión de migración 008, con UNA SOLA diferencia:
--    el INSERT usa is_active = TRUE en lugar de FALSE.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_referrer_code := TRIM(COALESCE(NEW.raw_user_meta_data->>'referral_code', ''));

  v_base_username := COALESCE(
    NULLIF(TRIM(regexp_replace(LOWER(COALESCE(NEW.raw_user_meta_data->>'username', '')), '[^a-z0-9_]', '', 'g')), ''),
    NULLIF(TRIM(regexp_replace(LOWER(split_part(NEW.email, '@', 1)), '[^a-z0-9_]', '', 'g')), ''),
    'user'
  );
  v_base_username := LEFT(v_base_username, 30);

  v_username := v_base_username;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE username = v_username) LOOP
    v_counter := v_counter + 1;
    v_username := LEFT(v_base_username, 25) || v_counter::TEXT;
  END LOOP;

  v_referral_code := v_username;
  WHILE EXISTS (SELECT 1 FROM profiles WHERE referral_code = v_referral_code AND id != NEW.id) LOOP
    v_counter := v_counter + 1;
    v_referral_code := LEFT(v_base_username, 25) || v_counter::TEXT;
  END LOOP;

  IF v_referrer_code != '' THEN
    SELECT id INTO v_referrer_id
    FROM profiles
    WHERE LOWER(referral_code) = LOWER(v_referrer_code)
    LIMIT 1;
  END IF;

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
    TRUE, -- ← FIX: antes era FALSE (migración 008)
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

  IF v_referrer_id IS NOT NULL THEN
    INSERT INTO referrals (referrer_id, referred_id, referred_username, referred_level)
    VALUES (v_referrer_id, NEW.id, v_username, 1)
    ON CONFLICT (referred_id) DO NOTHING;
  END IF;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[handle_new_user] Error al crear perfil para usuario %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger ya existe (creado en migración 008), no hay que recrearlo —
-- CREATE OR REPLACE FUNCTION actualiza la lógica sin romper el binding.
