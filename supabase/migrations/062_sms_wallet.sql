-- =============================================================================
-- Migration 062: Billetera SMS — Saldo recargable para SMS Masivos
-- =============================================================================

-- ── 1. Tabla de billetera SMS (una por usuario) ────────────────────────────
CREATE TABLE IF NOT EXISTS sms_wallets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  balance      integer     NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_recharged integer  NOT NULL DEFAULT 0,
  total_consumed  integer  NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE sms_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sees_own_sms_wallet" ON sms_wallets;
CREATE POLICY "user_sees_own_sms_wallet" ON sms_wallets FOR SELECT
  USING (user_id = auth.uid());

-- ── 2. Tabla de pagos de recarga SMS vía ePayco ───────────────────────────
CREATE TABLE IF NOT EXISTS sms_wallet_payments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount       integer     NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','failed')),
  invoice      text        UNIQUE,
  epayco_ref   text,
  created_at   timestamptz DEFAULT now(),
  approved_at  timestamptz
);

ALTER TABLE sms_wallet_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sees_own_sms_payments" ON sms_wallet_payments;
CREATE POLICY "user_sees_own_sms_payments" ON sms_wallet_payments FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "service_manages_sms_payments" ON sms_wallet_payments;
CREATE POLICY "service_manages_sms_payments" ON sms_wallet_payments FOR ALL
  USING (true) WITH CHECK (true);

-- ── 3. Función para asegurar billetera SMS existe ─────────────────────────
CREATE OR REPLACE FUNCTION sms_ensure_wallet(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sms_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- ── 4. Función para acreditar recarga SMS ─────────────────────────────────
CREATE OR REPLACE FUNCTION sms_wallet_credit(p_user_id uuid, p_amount integer, p_description text DEFAULT 'Recarga SMS')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM sms_ensure_wallet(p_user_id);
  UPDATE sms_wallets
    SET balance = balance + p_amount,
        total_recharged = total_recharged + p_amount,
        updated_at = now()
    WHERE user_id = p_user_id;
END;
$$;
