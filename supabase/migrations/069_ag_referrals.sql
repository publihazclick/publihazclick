-- =============================================================================
-- Migration 069: Anda y Gana — Sistema de referidos con billetera de retiro
-- =============================================================================

-- ── Agregar referred_by a ag_users ──────────────────────────────────────────
ALTER TABLE ag_users
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES ag_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ag_users_referred_by_idx ON ag_users(referred_by);

-- ── Billetera de retiro por referidos ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS ag_referral_wallet (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ag_user_id       uuid        UNIQUE NOT NULL REFERENCES ag_users(id) ON DELETE CASCADE,
  balance          integer     NOT NULL DEFAULT 0,  -- en pesos (COP)
  total_earned     integer     NOT NULL DEFAULT 0,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ag_referral_wallet_user_idx ON ag_referral_wallet(ag_user_id);

ALTER TABLE ag_referral_wallet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_wallet_own" ON ag_referral_wallet;
CREATE POLICY "referral_wallet_own" ON ag_referral_wallet FOR ALL
  USING (ag_user_id IN (SELECT id FROM ag_users WHERE auth_user_id = auth.uid()));

-- ── Transacciones de la billetera de retiro ─────────────────────────────────
CREATE TABLE IF NOT EXISTS ag_referral_transactions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id         uuid        NOT NULL REFERENCES ag_referral_wallet(id) ON DELETE CASCADE,
  referrer_user_id  uuid        NOT NULL REFERENCES ag_users(id),
  referred_user_id  uuid        NOT NULL REFERENCES ag_users(id),
  trip_request_id   uuid        REFERENCES ag_trip_requests(id),
  trip_value        integer     NOT NULL,
  commission_pct    numeric     NOT NULL DEFAULT 2,
  commission_amount integer     NOT NULL,
  description       text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ag_referral_tx_wallet_idx ON ag_referral_transactions(wallet_id);

ALTER TABLE ag_referral_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "referral_tx_own" ON ag_referral_transactions;
CREATE POLICY "referral_tx_own" ON ag_referral_transactions FOR SELECT
  USING (referrer_user_id IN (SELECT id FROM ag_users WHERE auth_user_id = auth.uid()));

-- ── Función: pagar comisión de referido al completar viaje ──────────────────
CREATE OR REPLACE FUNCTION ag_complete_trip(p_trip_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trip         record;
  v_passenger    record;
  v_driver_user  record;
  v_referrer_id  uuid;
  v_commission   integer;
  v_wallet_id    uuid;
BEGIN
  -- Marcar viaje como completado
  UPDATE ag_trip_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_trip_request_id AND status = 'accepted';

  -- Obtener datos del viaje
  SELECT * INTO v_trip FROM ag_trip_requests WHERE id = p_trip_request_id;
  IF v_trip IS NULL OR v_trip.status <> 'completed' THEN RETURN; END IF;

  -- ── Comisión por referido del PASAJERO ──
  SELECT * INTO v_passenger FROM ag_users WHERE id = v_trip.passenger_user_id;
  IF v_passenger IS NOT NULL AND v_passenger.referred_by IS NOT NULL THEN
    v_referrer_id := v_passenger.referred_by;
    v_commission := CEIL(v_trip.offered_price::numeric * 2 / 100.0)::integer;

    IF v_commission > 0 THEN
      -- Crear billetera si no existe
      INSERT INTO ag_referral_wallet (ag_user_id) VALUES (v_referrer_id)
      ON CONFLICT (ag_user_id) DO NOTHING;

      SELECT id INTO v_wallet_id FROM ag_referral_wallet WHERE ag_user_id = v_referrer_id;

      UPDATE ag_referral_wallet
      SET balance = balance + v_commission, total_earned = total_earned + v_commission, updated_at = now()
      WHERE id = v_wallet_id;

      INSERT INTO ag_referral_transactions
        (wallet_id, referrer_user_id, referred_user_id, trip_request_id, trip_value, commission_pct, commission_amount, description)
      VALUES (
        v_wallet_id, v_referrer_id, v_passenger.id, p_trip_request_id,
        v_trip.offered_price, 2, v_commission,
        'Comisión 2% — viaje pasajero ' || v_passenger.full_name || ' $' || v_trip.offered_price
      );
    END IF;
  END IF;

  -- ── Comisión por referido del CONDUCTOR ──
  IF v_trip.driver_id IS NOT NULL THEN
    SELECT au.* INTO v_driver_user
    FROM ag_users au
    JOIN ag_drivers ad ON ad.ag_user_id = au.id
    WHERE ad.id = v_trip.driver_id;

    IF v_driver_user IS NOT NULL AND v_driver_user.referred_by IS NOT NULL THEN
      v_referrer_id := v_driver_user.referred_by;
      v_commission := CEIL(v_trip.offered_price::numeric * 2 / 100.0)::integer;

      IF v_commission > 0 THEN
        INSERT INTO ag_referral_wallet (ag_user_id) VALUES (v_referrer_id)
        ON CONFLICT (ag_user_id) DO NOTHING;

        SELECT id INTO v_wallet_id FROM ag_referral_wallet WHERE ag_user_id = v_referrer_id;

        UPDATE ag_referral_wallet
        SET balance = balance + v_commission, total_earned = total_earned + v_commission, updated_at = now()
        WHERE id = v_wallet_id;

        INSERT INTO ag_referral_transactions
          (wallet_id, referrer_user_id, referred_user_id, trip_request_id, trip_value, commission_pct, commission_amount, description)
        VALUES (
          v_wallet_id, v_referrer_id, v_driver_user.id, p_trip_request_id,
          v_trip.offered_price, 2, v_commission,
          'Comisión 2% — viaje conductor ' || v_driver_user.full_name || ' $' || v_trip.offered_price
        );
      END IF;
    END IF;
  END IF;
END;
$$;
