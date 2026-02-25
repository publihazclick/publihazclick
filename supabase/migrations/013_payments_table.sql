-- =============================================================================
-- Migration 013: Tabla de pagos y función de procesamiento
-- Soporta: Nequi (vía Wompi), extensible a PSE y tarjetas
-- =============================================================================

-- ── Tabla principal de pagos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                      UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                 UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  package_id              UUID          NOT NULL REFERENCES packages(id),
  package_name            TEXT          NOT NULL,

  -- Monto siempre en centavos COP (estándar Wompi)
  amount_in_cents         BIGINT        NOT NULL,
  currency                TEXT          NOT NULL DEFAULT 'COP',

  -- Estado: pending | approved | declined | voided | error
  status                  TEXT          NOT NULL DEFAULT 'pending',

  -- Método y pasarela
  payment_method          TEXT          NOT NULL DEFAULT 'nequi',   -- nequi | pse | card
  gateway                 TEXT          NOT NULL DEFAULT 'wompi',

  -- IDs de la pasarela
  gateway_transaction_id  TEXT          UNIQUE,
  gateway_reference       TEXT          UNIQUE,

  -- Datos específicos del método
  phone_number            TEXT,         -- Nequi: número del pagador

  -- Auditoría
  error_message           TEXT,
  metadata                JSONB         DEFAULT '{}',
  created_at              TIMESTAMPTZ   DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS payments_user_id_idx             ON payments(user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx              ON payments(status);
CREATE INDEX IF NOT EXISTS payments_gateway_tx_idx          ON payments(gateway_transaction_id);
CREATE INDEX IF NOT EXISTS payments_created_at_idx          ON payments(created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Usuarios ven solo sus pagos
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

-- Admins ven todos los pagos
CREATE POLICY "Admins can view all payments"
  ON payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );

-- Solo service_role puede insertar/actualizar (desde Edge Functions)
CREATE POLICY "Service role full access"
  ON payments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Función: procesar pago aprobado ──────────────────────────────────────────
-- Llamada desde el webhook cuando Wompi confirma el pago
CREATE OR REPLACE FUNCTION process_successful_payment(
  p_gateway_transaction_id TEXT,
  p_new_status             TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment RECORD;
BEGIN
  -- Buscar el pago pendiente
  SELECT * INTO v_payment
  FROM payments
  WHERE gateway_transaction_id = p_gateway_transaction_id
    AND status = 'pending'
  LIMIT 1;

  IF v_payment.id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Actualizar estado del pago
  UPDATE payments
  SET
    status     = p_new_status,
    updated_at = NOW()
  WHERE id = v_payment.id;

  -- Si fue aprobado, activar el paquete
  IF p_new_status = 'approved' THEN
    PERFORM activate_user_package(v_payment.user_id, v_payment.package_id);

    -- Registrar método de pago en user_packages
    UPDATE user_packages
    SET
      payment_method = v_payment.payment_method,
      payment_id     = v_payment.gateway_transaction_id
    WHERE user_id    = v_payment.user_id
      AND package_id = v_payment.package_id
      AND created_at >= NOW() - INTERVAL '10 minutes'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  RETURN TRUE;
END;
$$;

-- ── Comentarios ──────────────────────────────────────────────────────────────
COMMENT ON TABLE payments IS 'Registro de todos los pagos de paquetes vía Wompi';
COMMENT ON COLUMN payments.amount_in_cents IS 'Monto en centavos COP (ej: 100000 = $1,000 COP)';
COMMENT ON COLUMN payments.gateway_transaction_id IS 'ID de transacción asignado por Wompi';
COMMENT ON COLUMN payments.gateway_reference IS 'Referencia única generada por nosotros (PHC-...)';

-- =============================================================================
-- FIN
-- =============================================================================
