-- =============================================================================
-- Migration 059: Billetera IA — Saldo recargable para herramientas de IA
-- El usuario recarga vía ePayco y consume créditos al usar las herramientas.
-- =============================================================================

-- ── 1. Tabla de billetera IA (una por usuario) ──────────────────────────────
CREATE TABLE IF NOT EXISTS ai_wallets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  balance      integer     NOT NULL DEFAULT 0 CHECK (balance >= 0),  -- saldo en COP
  total_recharged integer  NOT NULL DEFAULT 0,  -- total histórico recargado
  total_consumed  integer  NOT NULL DEFAULT 0,  -- total histórico consumido
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE ai_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sees_own_ai_wallet" ON ai_wallets;
CREATE POLICY "user_sees_own_ai_wallet" ON ai_wallets FOR SELECT
  USING (user_id = auth.uid());

-- ── 2. Tabla de transacciones de billetera IA ───────────────────────────────
CREATE TABLE IF NOT EXISTS ai_wallet_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id    uuid        NOT NULL REFERENCES ai_wallets(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('recharge','consumption','refund','bonus')),
  amount       integer     NOT NULL,  -- monto en COP (positivo=ingreso, negativo=consumo)
  balance_after integer    NOT NULL,  -- saldo después de la transacción
  description  text,
  metadata     jsonb       DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE ai_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sees_own_ai_transactions" ON ai_wallet_transactions;
CREATE POLICY "user_sees_own_ai_transactions" ON ai_wallet_transactions FOR SELECT
  USING (user_id = auth.uid());

CREATE INDEX idx_ai_wallet_tx_user   ON ai_wallet_transactions(user_id);
CREATE INDEX idx_ai_wallet_tx_wallet ON ai_wallet_transactions(wallet_id);
CREATE INDEX idx_ai_wallet_tx_type   ON ai_wallet_transactions(type);

-- ── 3. Tabla de pagos de recarga IA vía ePayco ─────────────────────────────
CREATE TABLE IF NOT EXISTS ai_wallet_payments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount       integer     NOT NULL,  -- monto en COP
  status       text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','failed')),
  invoice      text        UNIQUE,
  epayco_ref   text,
  created_at   timestamptz DEFAULT now(),
  approved_at  timestamptz
);

ALTER TABLE ai_wallet_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sees_own_ai_wallet_payments" ON ai_wallet_payments;
CREATE POLICY "user_sees_own_ai_wallet_payments" ON ai_wallet_payments FOR SELECT
  USING (user_id = auth.uid());

-- ── 4. Función: crear billetera si no existe ────────────────────────────────
CREATE OR REPLACE FUNCTION ai_ensure_wallet(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id uuid;
BEGIN
  SELECT id INTO v_wallet_id FROM ai_wallets WHERE user_id = p_user_id;
  IF v_wallet_id IS NULL THEN
    INSERT INTO ai_wallets (user_id) VALUES (p_user_id) RETURNING id INTO v_wallet_id;
  END IF;
  RETURN v_wallet_id;
END;
$$;

-- ── 5. Función: aprobar pago y recargar billetera atómicamente ──────────────
CREATE OR REPLACE FUNCTION ai_approve_wallet_payment(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id   uuid;
  v_amount    integer;
  v_wallet_id uuid;
  v_new_balance integer;
BEGIN
  -- Obtener pago pendiente
  SELECT user_id, amount
  INTO   v_user_id, v_amount
  FROM   ai_wallet_payments
  WHERE  id = p_payment_id AND status = 'pending';

  IF v_user_id IS NULL THEN RETURN; END IF;

  -- Asegurar que existe la billetera
  v_wallet_id := ai_ensure_wallet(v_user_id);

  -- Actualizar pago
  UPDATE ai_wallet_payments
  SET    status = 'approved', approved_at = now()
  WHERE  id = p_payment_id;

  -- Recargar saldo
  UPDATE ai_wallets
  SET    balance = balance + v_amount,
         total_recharged = total_recharged + v_amount,
         updated_at = now()
  WHERE  id = v_wallet_id
  RETURNING balance INTO v_new_balance;

  -- Registrar transacción
  INSERT INTO ai_wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, metadata)
  VALUES (v_wallet_id, v_user_id, 'recharge', v_amount, v_new_balance,
          'Recarga vía ePayco',
          jsonb_build_object('payment_id', p_payment_id));
END;
$$;

-- ── 6. Función: consumir saldo de billetera IA ─────────────────────────────
CREATE OR REPLACE FUNCTION ai_consume_credits(
  p_user_id     uuid,
  p_amount      integer,
  p_description text DEFAULT 'Consumo herramienta IA',
  p_metadata    jsonb DEFAULT '{}'
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet_id   uuid;
  v_new_balance integer;
BEGIN
  v_wallet_id := ai_ensure_wallet(p_user_id);

  -- Intentar descontar (CHECK constraint previene negativo)
  UPDATE ai_wallets
  SET    balance = balance - p_amount,
         total_consumed = total_consumed + p_amount,
         updated_at = now()
  WHERE  id = v_wallet_id AND balance >= p_amount
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Registrar transacción
  INSERT INTO ai_wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, metadata)
  VALUES (v_wallet_id, p_user_id, 'consumption', -p_amount, v_new_balance, p_description, p_metadata);

  RETURN true;
END;
$$;
