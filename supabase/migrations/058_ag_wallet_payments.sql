-- =============================================================================
-- Migration 058: Anda y Gana — Pagos de recarga de billetera vía ePayco
-- =============================================================================

CREATE TABLE IF NOT EXISTS ag_wallet_payments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    uuid        NOT NULL REFERENCES ag_drivers(id) ON DELETE CASCADE,
  amount       integer     NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','failed')),
  invoice      text        UNIQUE,
  epayco_ref   text,
  created_at   timestamptz DEFAULT now(),
  approved_at  timestamptz
);

ALTER TABLE ag_wallet_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_sees_own_wallet_payments" ON ag_wallet_payments;
CREATE POLICY "driver_sees_own_wallet_payments" ON ag_wallet_payments FOR SELECT
  USING (
    driver_id IN (
      SELECT id FROM ag_drivers WHERE ag_user_id IN (
        SELECT id FROM ag_users WHERE auth_user_id = auth.uid()
      )
    )
  );

-- ── RPC: aprobar pago y recargar billetera atómicamente ───────────────────────
CREATE OR REPLACE FUNCTION ag_approve_wallet_payment(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id uuid;
  v_amount    integer;
BEGIN
  SELECT driver_id, amount
  INTO   v_driver_id, v_amount
  FROM   ag_wallet_payments
  WHERE  id = p_payment_id AND status = 'pending';

  IF v_driver_id IS NULL THEN RETURN; END IF;

  UPDATE ag_wallet_payments
  SET    status = 'approved', approved_at = now()
  WHERE  id = p_payment_id;

  PERFORM ag_recharge_driver_wallet(v_driver_id, v_amount);
END;
$$;
