-- =============================================================================
-- Migration 148: Programa Fundadores + Comisión Escalonada Movi
-- =============================================================================

-- ── Columnas en ag_drivers ───────────────────────────────────────────────────
ALTER TABLE ag_drivers
  ADD COLUMN IF NOT EXISTS is_founder      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS founder_number  INTEGER;

-- Todos los conductores existentes son Fundadores (registrados antes del lanzamiento)
UPDATE ag_drivers
SET is_founder = true,
    founder_number = (
      SELECT COUNT(*) FROM ag_drivers d2
      WHERE d2.created_at <= ag_drivers.created_at
    )
WHERE is_founder = false;

-- ── Trigger: asignar badge Fundador automáticamente a los primeros 500 ────────
CREATE OR REPLACE FUNCTION ag_assign_founder_badge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count FROM ag_drivers WHERE is_founder = true;
  IF v_count <= 500 THEN
    NEW.is_founder     := true;
    NEW.founder_number := v_count;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_founder_badge ON ag_drivers;
CREATE TRIGGER trg_ag_founder_badge
  BEFORE INSERT ON ag_drivers
  FOR EACH ROW EXECUTE FUNCTION ag_assign_founder_badge();

-- ── Función: comisión según viajes completados ese mes ───────────────────────
CREATE OR REPLACE FUNCTION ag_driver_monthly_commission_pct(p_driver_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE
    WHEN COUNT(*) >= 121 THEN 6
    WHEN COUNT(*) >= 71  THEN 8
    WHEN COUNT(*) >= 31  THEN 10
    ELSE 12
  END
  FROM ag_trip_requests
  WHERE driver_id    = p_driver_id
    AND status       = 'completed'
    AND completed_at >= date_trunc('month', now());
$$;

-- ── Función pública para que el frontend pueda llamarla ──────────────────────
DROP FUNCTION IF EXISTS get_driver_commission_pct(uuid);
CREATE OR REPLACE FUNCTION get_driver_commission_pct(p_driver_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT ag_driver_monthly_commission_pct(p_driver_id);
$$;

-- ── RPC: obtiene todos los beneficios del conductor de una sola llamada ───────
DROP FUNCTION IF EXISTS ag_get_driver_benefits(uuid);
CREATE OR REPLACE FUNCTION ag_get_driver_benefits(p_driver_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_monthly_trips  INT;
  v_commission_pct INT;
  v_is_founder     BOOLEAN;
  v_founder_number INT;
  v_total_trips    INT;
  v_tier_label     TEXT;
  v_next_tier      INT;
  v_next_pct       INT;
BEGIN
  -- Viajes este mes
  SELECT COUNT(*) INTO v_monthly_trips
  FROM ag_trip_requests
  WHERE driver_id = p_driver_id
    AND status = 'completed'
    AND completed_at >= date_trunc('month', now());

  -- Totales
  SELECT COALESCE(metric_trips_completed, 0), COALESCE(is_founder, false), founder_number
  INTO v_total_trips, v_is_founder, v_founder_number
  FROM ag_drivers WHERE id = p_driver_id;

  -- Tier y comisión
  IF v_monthly_trips >= 121 THEN
    v_commission_pct := 6; v_tier_label := 'Leyenda'; v_next_tier := 0; v_next_pct := 6;
  ELSIF v_monthly_trips >= 71 THEN
    v_commission_pct := 8; v_tier_label := 'Pro'; v_next_tier := 121; v_next_pct := 6;
  ELSIF v_monthly_trips >= 31 THEN
    v_commission_pct := 10; v_tier_label := 'Activo'; v_next_tier := 71; v_next_pct := 8;
  ELSE
    v_commission_pct := 12; v_tier_label := 'Nuevo'; v_next_tier := 31; v_next_pct := 10;
  END IF;

  RETURN jsonb_build_object(
    'monthly_trips',    v_monthly_trips,
    'total_trips',      v_total_trips,
    'commission_pct',   v_commission_pct,
    'tier_label',       v_tier_label,
    'next_tier_trips',  v_next_tier,
    'next_tier_pct',    v_next_pct,
    'is_founder',       v_is_founder,
    'founder_number',   v_founder_number,
    'founders_left',    GREATEST(0, 500 - (SELECT COUNT(*) FROM ag_drivers WHERE is_founder = true))
  );
END;
$$;
