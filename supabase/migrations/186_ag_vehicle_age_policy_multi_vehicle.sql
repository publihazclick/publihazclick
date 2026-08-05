-- =============================================================================
-- Migration 186: Mismo candado de antigüedad de vehículos (migración 185) pero
-- para ag_driver_vehicles -- la tabla de "mis vehículos" (multi-vehículo por
-- conductor) es una tabla DISTINTA de ag_drivers, con columna `year` en vez de
-- `vehicle_year`. Sin esto, un conductor podía saltarse el límite agregando
-- el carro viejo ahí en vez de en su perfil principal.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ag_validate_driver_vehicle_age()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_current_year INT := EXTRACT(YEAR FROM now())::INT;
  v_cap          INT;
  v_age          INT;
BEGIN
  IF NEW.year IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.year > v_current_year + 1 THEN
    RAISE EXCEPTION 'AÑO_INVALIDO: El año del vehículo no puede ser futuro';
  END IF;

  SELECT COALESCE(value::int, 20) INTO v_cap
  FROM public.platform_settings
  WHERE key = CASE WHEN NEW.vehicle_type ILIKE '%moto%' THEN 'ag_max_vehicle_age_moto' ELSE 'ag_max_vehicle_age_car' END;

  v_age := v_current_year - NEW.year;
  IF v_age > COALESCE(v_cap, 20) THEN
    RAISE EXCEPTION 'VEHICULO_MUY_ANTIGUO: Tu % es del %, tiene % años. El máximo permitido es % años.',
      CASE WHEN NEW.vehicle_type ILIKE '%moto%' THEN 'moto' ELSE 'vehículo' END,
      NEW.year, v_age, v_cap;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_validate_driver_vehicle_age ON public.ag_driver_vehicles;
CREATE TRIGGER trg_ag_validate_driver_vehicle_age
  BEFORE INSERT OR UPDATE OF year, vehicle_type ON public.ag_driver_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.ag_validate_driver_vehicle_age();
