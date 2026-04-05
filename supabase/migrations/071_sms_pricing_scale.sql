-- =============================================================================
-- Migration 071: Escala de precios SMS — credit_amount para bonificaciones
-- =============================================================================

-- Agregar columna credit_amount para almacenar el monto acreditado (con bonus)
-- separado del monto pagado (amount). Esto permite que recargas grandes
-- acrediten más COP al wallet (descuento por volumen).
ALTER TABLE sms_wallet_payments ADD COLUMN IF NOT EXISTS credit_amount integer;
