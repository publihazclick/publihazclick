-- =============================================================================
-- Migration 053: Anda y Gana — Sistema de ofertas conductor ↔ pasajero
-- =============================================================================

-- ── Tabla de ofertas ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ag_trip_offers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_request_id  uuid        NOT NULL REFERENCES ag_trip_requests(id) ON DELETE CASCADE,
  driver_id        uuid        NOT NULL REFERENCES ag_drivers(id) ON DELETE CASCADE,
  offered_price    integer     NOT NULL,
  status           text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ag_trip_offers_request_idx ON ag_trip_offers(trip_request_id);
CREATE INDEX IF NOT EXISTS ag_trip_offers_driver_idx  ON ag_trip_offers(driver_id);
CREATE INDEX IF NOT EXISTS ag_trip_offers_status_idx  ON ag_trip_offers(status);

-- ── Columna accepted_offer_id en ag_trip_requests ───────────────────────────
ALTER TABLE ag_trip_requests
  ADD COLUMN IF NOT EXISTS accepted_offer_id uuid REFERENCES ag_trip_offers(id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE ag_trip_offers ENABLE ROW LEVEL SECURITY;

-- Pasajero ve las ofertas de sus propias solicitudes
DROP POLICY IF EXISTS "passenger_sees_offers" ON ag_trip_offers;
CREATE POLICY "passenger_sees_offers" ON ag_trip_offers FOR SELECT
  USING (
    trip_request_id IN (
      SELECT id FROM ag_trip_requests
      WHERE passenger_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Conductor ve sus propias ofertas
DROP POLICY IF EXISTS "driver_sees_own_offers" ON ag_trip_offers;
CREATE POLICY "driver_sees_own_offers" ON ag_trip_offers FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Conductor puede insertar ofertas
DROP POLICY IF EXISTS "driver_insert_offer" ON ag_trip_offers;
CREATE POLICY "driver_insert_offer" ON ag_trip_offers FOR INSERT
  WITH CHECK (
    driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Pasajero puede actualizar estado (aceptar / rechazar)
DROP POLICY IF EXISTS "passenger_update_offer" ON ag_trip_offers;
CREATE POLICY "passenger_update_offer" ON ag_trip_offers FOR UPDATE
  USING (
    trip_request_id IN (
      SELECT id FROM ag_trip_requests
      WHERE passenger_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- ── Trigger: al aceptar oferta, cancela las demás y actualiza la solicitud ──
CREATE OR REPLACE FUNCTION ag_on_offer_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    -- Cancelar otras ofertas pendientes
    UPDATE ag_trip_offers
    SET status = 'cancelled', updated_at = now()
    WHERE trip_request_id = NEW.trip_request_id
      AND id <> NEW.id
      AND status = 'pending';

    -- Confirmar la solicitud de viaje
    UPDATE ag_trip_requests
    SET status = 'accepted',
        driver_id = NEW.driver_id,
        accepted_offer_id = NEW.id,
        updated_at = now()
    WHERE id = NEW.trip_request_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offer_accepted ON ag_trip_offers;
CREATE TRIGGER trg_offer_accepted
  AFTER UPDATE ON ag_trip_offers
  FOR EACH ROW EXECUTE FUNCTION ag_on_offer_accepted();

-- ── Realtime ─────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE ag_trip_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE ag_trip_requests;
