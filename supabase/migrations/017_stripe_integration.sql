-- =============================================================================
-- Migration 017: Stripe Integration
-- Adds Stripe-specific columns to payments table and RPC for webhook processing
-- =============================================================================

-- Columnas Stripe en payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Índice para lookup rápido por session_id (webhook)
CREATE INDEX IF NOT EXISTS payments_stripe_session_idx ON payments(stripe_session_id);

-- =============================================================================
-- RPC: procesar pago Stripe (llamado desde el webhook stripe-webhook)
-- =============================================================================
CREATE OR REPLACE FUNCTION process_stripe_payment(
  p_stripe_session_id TEXT,
  p_payment_intent_id TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_payment RECORD;
BEGIN
  -- Buscar pago pendiente por stripe_session_id
  SELECT * INTO v_payment
  FROM payments
  WHERE stripe_session_id = p_stripe_session_id
    AND status = 'pending'
  LIMIT 1;

  IF v_payment.id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Actualizar payment a aprobado
  UPDATE payments SET
    status = 'approved',
    stripe_payment_intent_id = p_payment_intent_id,
    gateway_transaction_id = p_payment_intent_id,
    updated_at = NOW()
  WHERE id = v_payment.id;

  -- Activar paquete (misma función RPC usada por Nequi)
  PERFORM activate_user_package(v_payment.user_id, v_payment.package_id);

  RETURN TRUE;
END; $$;
