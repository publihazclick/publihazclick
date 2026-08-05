-- =============================================================================
-- Migration 185: Política de antigüedad máxima de vehículos
-- Pedido explícito del usuario 2026-08-04. Investigado antes de fijar números:
-- Uber Colombia acepta modelo 2001+ (~25 años, sin tope real), inDrive no
-- publica ningún límite. La única cifra oficial que existe en Colombia es la
-- "vida útil" del Decreto 478 de 2021 para transporte especial: 20 años
-- (aunque apps tipo Uber/Movi operan fuera de esa categoría regulada
-- formalmente, es la referencia más defendible si algún día se pregunta
-- "¿por qué ese número?"). Se usa 20 años para carros -- ya más estricto que
-- ambos competidores directos -- y 15 para motos (se desgastan mecánicamente
-- más rápido, más dependientes del estado mecánico para la seguridad).
-- =============================================================================

-- ── Topes configurables desde admin (mismo patrón que ag_commission_pct) ────
INSERT INTO public.platform_settings (key, value) VALUES
  ('ag_max_vehicle_age_car',  '20'),
  ('ag_max_vehicle_age_moto', '15')
ON CONFLICT (key) DO NOTHING;

-- ── Marca si un vehículo ya aprobado "envejeció" más allá del tope (lo pone
--    el cron mensual de abajo) -- el frontend usa esto para pedirle al
--    conductor que actualice su vehículo, en vez de solo rechazar en silencio ──
ALTER TABLE public.ag_drivers
  ADD COLUMN IF NOT EXISTS vehicle_needs_update BOOLEAN NOT NULL DEFAULT false;

-- ── Trigger: valida la antigüedad en cada INSERT/UPDATE de ag_drivers ───────
-- Corre para CUALQUIER camino que escriba vehicle_year (registro rápido,
-- registro completo, edición de vehículo desde el panel admin) -- no depende
-- de que el frontend recuerde validar, la base de datos es la última línea.
CREATE OR REPLACE FUNCTION public.ag_validate_vehicle_age()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_current_year INT := EXTRACT(YEAR FROM now())::INT;
  v_cap          INT;
  v_age          INT;
BEGIN
  IF NEW.vehicle_year IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.vehicle_year > v_current_year + 1 THEN
    RAISE EXCEPTION 'AÑO_INVALIDO: El año del vehículo no puede ser futuro';
  END IF;

  SELECT COALESCE(value::int, 20) INTO v_cap
  FROM public.platform_settings
  WHERE key = CASE WHEN NEW.vehicle_type ILIKE '%moto%' THEN 'ag_max_vehicle_age_moto' ELSE 'ag_max_vehicle_age_car' END;

  v_age := v_current_year - NEW.vehicle_year;
  IF v_age > COALESCE(v_cap, 20) THEN
    RAISE EXCEPTION 'VEHICULO_MUY_ANTIGUO: Tu % es del %, tiene % años. El máximo permitido es % años.',
      CASE WHEN NEW.vehicle_type ILIKE '%moto%' THEN 'moto' ELSE 'vehículo' END,
      NEW.vehicle_year, v_age, v_cap;
  END IF;

  -- Si el vehículo vuelve a estar dentro del tope (lo actualizaron), limpiar la marca
  NEW.vehicle_needs_update := false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_validate_vehicle_age ON public.ag_drivers;
CREATE TRIGGER trg_ag_validate_vehicle_age
  BEFORE INSERT OR UPDATE OF vehicle_year, vehicle_type ON public.ag_drivers
  FOR EACH ROW EXECUTE FUNCTION public.ag_validate_vehicle_age();

-- ── Re-chequeo mensual: un vehículo válido al registrarse eventualmente
--    "envejece" más allá del tope mientras el conductor sigue activo -- esto
--    no dispara el trigger (nadie está haciendo UPDATE), así que hace falta
--    un barrido periódico. Marca vehicle_needs_update + pone al conductor
--    fuera de línea (no lo borra ni le quita el historial) -- el frontend le
--    pide actualizar el vehículo antes de volver a conectarse. ─────────────
SELECT cron.schedule(
  'flag-aged-out-vehicles',
  '0 9 1 * *', -- 9am UTC el día 1 de cada mes
  $$
  UPDATE public.ag_drivers d
  SET vehicle_needs_update = true,
      is_online = false
  WHERE d.vehicle_year IS NOT NULL
    AND d.status = 'approved'
    AND d.vehicle_needs_update = false
    AND (EXTRACT(YEAR FROM now())::INT - d.vehicle_year) > (
      SELECT COALESCE(value::int, 20) FROM public.platform_settings
      WHERE key = CASE WHEN d.vehicle_type ILIKE '%moto%' THEN 'ag_max_vehicle_age_moto' ELSE 'ag_max_vehicle_age_car' END
    );
  $$
);
