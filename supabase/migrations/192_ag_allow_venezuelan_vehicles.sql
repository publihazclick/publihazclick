-- =============================================================================
-- Migration 192: corrección de la migración 191 -- el usuario confirmó que sí
-- se aceptan vehículos (carros y motos) colombianos Y venezolanos; lo único
-- que se restringe a Colombia es el conductor (cédula de ciudadanía
-- colombiana). Se revierte el chequeo de formato de placa colombiana de los
-- triggers de antigüedad (vuelven a validar solo año/tipo, como antes de la
-- 191) y se deja trg_ag_validate_driver_nationality intacto -- esa parte de
-- la 191 sigue vigente tal cual.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ag_validate_vehicle_age()
RETURNS trigger LANGUAGE plpgsql AS $$
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

  NEW.vehicle_needs_update := false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_validate_vehicle_age ON public.ag_drivers;
CREATE TRIGGER trg_ag_validate_vehicle_age
  BEFORE INSERT OR UPDATE OF vehicle_year, vehicle_type ON public.ag_drivers
  FOR EACH ROW EXECUTE FUNCTION ag_validate_vehicle_age();

CREATE OR REPLACE FUNCTION public.ag_validate_driver_vehicle_age()
RETURNS trigger LANGUAGE plpgsql AS $$
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
  FOR EACH ROW EXECUTE FUNCTION ag_validate_driver_vehicle_age();

-- trg_ag_validate_driver_nationality (país del conductor = Colombia, formato
-- de cédula) NO se toca -- sigue vigente tal como quedó en la migración 191.
