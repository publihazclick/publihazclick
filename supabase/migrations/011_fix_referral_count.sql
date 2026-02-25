-- =============================================================================
-- Migración 011: Fix conteo de afiliados (total_referrals_count)
-- Crea trigger para mantener el conteo actualizado y recalcula valores actuales
-- =============================================================================

-- 1. Función que actualiza total_referrals_count cuando se asigna referred_by
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_referral_count()
RETURNS TRIGGER AS $$
BEGIN
  -- INSERT: si el nuevo perfil tiene referidor, incrementar su conteo
  IF TG_OP = 'INSERT' AND NEW.referred_by IS NOT NULL THEN
    UPDATE profiles
    SET total_referrals_count = total_referrals_count + 1
    WHERE id = NEW.referred_by;
  END IF;

  -- UPDATE: si cambió el campo referred_by
  IF TG_OP = 'UPDATE' AND OLD.referred_by IS DISTINCT FROM NEW.referred_by THEN
    -- Decrementar al referidor anterior
    IF OLD.referred_by IS NOT NULL THEN
      UPDATE profiles
      SET total_referrals_count = GREATEST(0, total_referrals_count - 1)
      WHERE id = OLD.referred_by;
    END IF;
    -- Incrementar al nuevo referidor
    IF NEW.referred_by IS NOT NULL THEN
      UPDATE profiles
      SET total_referrals_count = total_referrals_count + 1
      WHERE id = NEW.referred_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Crear trigger
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_update_referral_count ON profiles;
CREATE TRIGGER trg_update_referral_count
  AFTER INSERT OR UPDATE OF referred_by ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_referral_count();

-- 3. Recalcular total_referrals_count para todos los usuarios existentes
-- ---------------------------------------------------------------------------
UPDATE profiles p
SET total_referrals_count = (
  SELECT COUNT(*)
  FROM profiles r
  WHERE r.referred_by = p.id
);

-- =============================================================================
-- FIN
-- =============================================================================
