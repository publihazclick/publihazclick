-- =============================================================================
-- Migration 055: Anda y Gana — Comisión admin + billetera conductores
-- =============================================================================

-- ── Porcentaje de comisión global (0–15) ────────────────────────────────────
INSERT INTO platform_settings (key, value)
VALUES ('ag_commission_pct', '0')
ON CONFLICT (key) DO NOTHING;

-- ── Billetera en ag_drivers ──────────────────────────────────────────────────
ALTER TABLE ag_drivers
  ADD COLUMN IF NOT EXISTS wallet_balance integer NOT NULL DEFAULT 0;

-- ── Historial de transacciones ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ag_wallet_transactions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     uuid        NOT NULL REFERENCES ag_drivers(id) ON DELETE CASCADE,
  amount        integer     NOT NULL,  -- positivo = recarga, negativo = cobro
  type          text        NOT NULL
    CHECK (type IN ('recharge','commission','refund')),
  trip_offer_id uuid        REFERENCES ag_trip_offers(id),
  description   text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ag_wallet_tx_driver_idx ON ag_wallet_transactions(driver_id);

ALTER TABLE ag_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_sees_own_wallet" ON ag_wallet_transactions;
CREATE POLICY "driver_sees_own_wallet" ON ag_wallet_transactions FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- ── Trigger actualizado: cobra comisión al aceptar oferta ────────────────────
CREATE OR REPLACE FUNCTION ag_on_offer_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_commission_pct    integer := 0;
  v_commission_amount integer := 0;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN

    -- Obtener porcentaje de comisión
    SELECT COALESCE(value::integer, 0)
    INTO v_commission_pct
    FROM platform_settings
    WHERE key = 'ag_commission_pct';

    v_commission_amount := CEIL(NEW.offered_price::numeric * v_commission_pct / 100.0)::integer;

    -- Cancelar otras ofertas pendientes
    UPDATE ag_trip_offers
    SET status = 'cancelled', updated_at = now()
    WHERE trip_request_id = NEW.trip_request_id
      AND id <> NEW.id
      AND status = 'pending';

    -- Confirmar solicitud de viaje
    UPDATE ag_trip_requests
    SET status = 'accepted',
        driver_id = NEW.driver_id,
        accepted_offer_id = NEW.id,
        updated_at = now()
    WHERE id = NEW.trip_request_id;

    -- Cobrar comisión si aplica
    IF v_commission_amount > 0 THEN
      UPDATE ag_drivers
      SET wallet_balance = wallet_balance - v_commission_amount
      WHERE id = NEW.driver_id;

      INSERT INTO ag_wallet_transactions
        (driver_id, amount, type, trip_offer_id, description)
      VALUES (
        NEW.driver_id,
        -v_commission_amount,
        'commission',
        NEW.id,
        'Comisión ' || v_commission_pct || '% — viaje $' || NEW.offered_price
      );
    END IF;

  END IF;
  RETURN NEW;
END;
$$;

-- El trigger ya existe (trg_offer_accepted), solo se actualiza la función.

-- ── RPC para recarga segura (admin) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION ag_recharge_driver_wallet(p_driver_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE ag_drivers
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_driver_id;

  INSERT INTO ag_wallet_transactions (driver_id, amount, type, description)
  VALUES (p_driver_id, p_amount, 'recharge', 'Recarga por administrador: $' || p_amount);
END;
$$;
