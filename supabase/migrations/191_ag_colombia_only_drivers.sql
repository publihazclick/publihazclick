-- =============================================================================
-- Migration 191: Solo conductores con cédula colombiana, solo vehículos con
-- placa colombiana -- pedido explícito del usuario 2026-08-05.
--
-- El formulario ya se ajustó en el frontend (país fijo a Colombia, validación
-- de formato de cédula y de placa antes de enviar), pero -- mismo patrón que
-- se ha seguido toda la sesión -- un insert/update crudo vía API podría saltarse
-- esa validación de cliente, así que se refuerza a nivel de base de datos.
--
-- Nota importante sobre id_number: el registro rápido (quick-register, edge
-- function ag-register-driver) NO recoge cédula todavía -- solo teléfono +57
-- y datos del vehículo -- así que el chequeo de formato de cédula solo aplica
-- CUANDO el valor no es nulo/vacío, para no romper ese flujo existente.
-- =============================================================================

-- ── Placa colombiana: se agrega el chequeo dentro de las funciones de
--    validación de antigüedad ya existentes (mismo trigger, no uno nuevo) y
--    se agrega 'plate' a la lista de columnas que disparan el trigger en
--    UPDATE (antes solo year/vehicle_type). 'PENDIENTE' se exceptúa -- es el
--    placeholder que usa el registro rápido cuando aún no hay placa. ────────
CREATE OR REPLACE FUNCTION public.ag_validate_vehicle_age()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_current_year INT := EXTRACT(YEAR FROM now())::INT;
  v_cap          INT;
  v_age          INT;
  v_plate        text;
  v_is_moto      boolean;
  v_plate_ok     boolean;
BEGIN
  IF NEW.vehicle_year IS NOT NULL THEN
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
  END IF;

  IF NEW.plate IS NOT NULL AND NEW.plate <> '' AND NEW.plate <> 'PENDIENTE' THEN
    v_plate   := UPPER(REGEXP_REPLACE(NEW.plate, '[\s-]', '', 'g'));
    v_is_moto := NEW.vehicle_type ILIKE '%moto%';
    IF v_is_moto THEN
      v_plate_ok := v_plate ~ '^[A-Z]{3}[0-9]{3}$' OR v_plate ~ '^[A-Z]{3}[0-9]{2}[A-Z]$';
    ELSE
      v_plate_ok := v_plate ~ '^[A-Z]{3}[0-9]{3}$';
    END IF;
    IF NOT v_plate_ok THEN
      RAISE EXCEPTION 'PLACA_NO_COLOMBIANA: La placa % no tiene formato de placa colombiana.', NEW.plate;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_validate_vehicle_age ON public.ag_drivers;
CREATE TRIGGER trg_ag_validate_vehicle_age
  BEFORE INSERT OR UPDATE OF vehicle_year, vehicle_type, plate ON public.ag_drivers
  FOR EACH ROW EXECUTE FUNCTION ag_validate_vehicle_age();

CREATE OR REPLACE FUNCTION public.ag_validate_driver_vehicle_age()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_current_year INT := EXTRACT(YEAR FROM now())::INT;
  v_cap          INT;
  v_age          INT;
  v_plate        text;
  v_is_moto      boolean;
  v_plate_ok     boolean;
BEGIN
  IF NEW.year IS NOT NULL THEN
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
  END IF;

  IF NEW.plate IS NOT NULL AND NEW.plate <> '' AND NEW.plate <> 'PENDIENTE' THEN
    v_plate   := UPPER(REGEXP_REPLACE(NEW.plate, '[\s-]', '', 'g'));
    v_is_moto := NEW.vehicle_type ILIKE '%moto%';
    IF v_is_moto THEN
      v_plate_ok := v_plate ~ '^[A-Z]{3}[0-9]{3}$' OR v_plate ~ '^[A-Z]{3}[0-9]{2}[A-Z]$';
    ELSE
      v_plate_ok := v_plate ~ '^[A-Z]{3}[0-9]{3}$';
    END IF;
    IF NOT v_plate_ok THEN
      RAISE EXCEPTION 'PLACA_NO_COLOMBIANA: La placa % no tiene formato de placa colombiana.', NEW.plate;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_validate_driver_vehicle_age ON public.ag_driver_vehicles;
CREATE TRIGGER trg_ag_validate_driver_vehicle_age
  BEFORE INSERT OR UPDATE OF year, vehicle_type, plate ON public.ag_driver_vehicles
  FOR EACH ROW EXECUTE FUNCTION ag_validate_driver_vehicle_age();

-- ── Nacionalidad del conductor: exige que el ag_users vinculado tenga
--    country = 'Colombia' (fail-open si es NULL -- no debería pasar en el
--    flujo normal, pero no queremos bloquear por un dato faltante que no es
--    culpa del conductor) y, si ya hay cédula cargada, que tenga formato de
--    documento colombiano. ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_validate_driver_nationality()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_country text;
BEGIN
  SELECT country INTO v_country FROM public.ag_users WHERE id = NEW.ag_user_id;

  IF v_country IS NOT NULL AND v_country <> 'Colombia' THEN
    RAISE EXCEPTION 'PAIS_NO_PERMITIDO: Por ahora Movi solo acepta conductores con cédula de ciudadanía colombiana.';
  END IF;

  IF NEW.id_number IS NOT NULL AND NEW.id_number <> '' AND NEW.id_number !~ '^[0-9]{6,10}$' THEN
    RAISE EXCEPTION 'CEDULA_INVALIDA: El número de cédula debe ser un documento colombiano válido (solo números, 6 a 10 dígitos).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_validate_driver_nationality ON public.ag_drivers;
CREATE TRIGGER trg_ag_validate_driver_nationality
  BEFORE INSERT OR UPDATE OF id_number ON public.ag_drivers
  FOR EACH ROW EXECUTE FUNCTION ag_validate_driver_nationality();
