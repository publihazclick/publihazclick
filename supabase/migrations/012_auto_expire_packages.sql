-- ============================================================
-- 012_auto_expire_packages.sql
-- Auto-expiración de paquetes de usuario al cumplir 30 días
-- ============================================================

-- ── Función: expire_user_packages ───────────────────────────
-- Busca paquetes activos cuyo end_date ya pasó, limpia el
-- perfil del usuario (rol → guest, beneficios → null) y
-- ELIMINA el registro de user_packages para permitir
-- re-asignación posterior sin conflictos.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION expire_user_packages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT up.id, up.user_id
    FROM   user_packages up
    WHERE  up.status   = 'active'
      AND  up.end_date <= NOW()
  LOOP
    -- 1. Limpiar perfil del usuario
    UPDATE profiles
    SET
      has_active_package  = false,
      current_package_id  = null,
      package_expires_at  = null,
      package_started_at  = null,
      role                = 'guest',
      updated_at          = NOW()
    WHERE id = rec.user_id;

    -- 2. Eliminar el registro de user_packages
    --    (así el usuario puede recibir un nuevo paquete sin conflictos)
    DELETE FROM user_packages WHERE id = rec.id;
  END LOOP;
END;
$$;

-- ── Programar con pg_cron: se ejecuta diariamente a las 00:00 UTC ──
-- pg_cron debe estar habilitado en el proyecto Supabase.
-- Si no está disponible, la función puede llamarse manualmente
-- o desde un Edge Function con cron schedule.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Eliminar job anterior si existe para evitar duplicados
    PERFORM cron.unschedule('expire-user-packages');
    PERFORM cron.schedule(
      'expire-user-packages',
      '0 0 * * *',
      'SELECT expire_user_packages()'
    );
  END IF;
END;
$$;
