-- ============================================================
-- 140_fix_advertiser_package_30_days.sql
-- Garantiza que todos los paquetes anunciante duren 30 días.
-- Recalcula package_expires_at desde package_started_at sin
-- tocar la fecha de activación/renovación de ningún usuario.
-- Expira a quienes ya llevan más de 30 días activos.
-- ============================================================

-- 1. Fijar duration_days = 30 en la tabla packages para todos
--    los paquetes anunciante (no afecta trading_bot_packages
--    que está en tabla separada).
UPDATE packages
SET    duration_days = 30,
       updated_at    = NOW()
WHERE  duration_days <> 30;

-- 2. Recalcular fechas para usuarios con paquete activo
DO $$
DECLARE
  rec             RECORD;
  correct_expires TIMESTAMPTZ;
BEGIN
  FOR rec IN
    SELECT id, package_started_at, role
    FROM   profiles
    WHERE  has_active_package = true
      AND  package_started_at IS NOT NULL
  LOOP
    correct_expires := rec.package_started_at + INTERVAL '30 days';

    IF correct_expires > NOW() THEN
      -- ── Paquete aún vigente: solo corregir la fecha de vencimiento ──
      UPDATE profiles
      SET    package_expires_at = correct_expires,
             updated_at         = NOW()
      WHERE  id = rec.id;

      -- Sincronizar también en user_packages
      UPDATE user_packages
      SET    end_date   = correct_expires,
             updated_at = NOW()
      WHERE  user_id = rec.id
        AND  status   = 'active';

    ELSE
      -- ── Ya pasaron 30 días desde activación: expirar el paquete ──
      UPDATE profiles
      SET    has_active_package = false,
             current_package_id = null,
             package_expires_at = null,
             package_started_at = null,
             role               = CASE WHEN role = 'advertiser' THEN 'guest' ELSE role END,
             updated_at         = NOW()
      WHERE  id = rec.id;

      -- Eliminar registro activo (mismo comportamiento que expire_user_packages)
      DELETE FROM user_packages
      WHERE  user_id = rec.id
        AND  status  = 'active';
    END IF;
  END LOOP;
END;
$$;
