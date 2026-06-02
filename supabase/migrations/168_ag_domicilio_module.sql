-- 168: Módulo Domicilio — columnas en ag_trip_requests + trigger delivery_code

-- ── 1. Columnas opcionales en ag_trip_requests ────────────────────────────────
ALTER TABLE ag_trip_requests
  ADD COLUMN IF NOT EXISTS service_type        VARCHAR(20)  DEFAULT 'viaje',
  ADD COLUMN IF NOT EXISTS package_type        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS package_description TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name      VARCHAR(120),
  ADD COLUMN IF NOT EXISTS recipient_phone     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS contactless_delivery BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_code       VARCHAR(4);

-- ── 2. Función que genera el código de 4 dígitos ──────────────────────────────
CREATE OR REPLACE FUNCTION ag_generate_delivery_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_service_type VARCHAR(20);
BEGIN
  -- Solo actúa cuando la oferta pasa a 'accepted'
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    -- Obtener el service_type del trip_request asociado
    SELECT service_type INTO v_service_type
      FROM ag_trip_requests
     WHERE id = NEW.trip_request_id;

    -- Solo generar código si es un domicilio
    IF v_service_type = 'domicilio' THEN
      UPDATE ag_trip_requests
         SET delivery_code = lpad(floor(random() * 10000)::int::text, 4, '0')
       WHERE id = NEW.trip_request_id
         AND (delivery_code IS NULL OR delivery_code = '');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Trigger en ag_trip_offers ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS ag_on_offer_accepted_delivery_code ON ag_trip_offers;

CREATE TRIGGER ag_on_offer_accepted_delivery_code
  AFTER UPDATE OF status ON ag_trip_offers
  FOR EACH ROW
  EXECUTE FUNCTION ag_generate_delivery_code();
