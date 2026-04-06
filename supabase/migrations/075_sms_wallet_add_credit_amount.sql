-- =============================================================================
-- Migration 075: Agregar columna credit_amount a sms_wallet_payments
-- Necesaria para almacenar el monto acreditado (con bonificación por volumen)
-- separado del monto base pagado (amount).
-- =============================================================================

ALTER TABLE sms_wallet_payments
  ADD COLUMN IF NOT EXISTS credit_amount integer;
