-- Eliminar columnas y funciones de Stripe de la base de datos
-- Stripe ha sido removido como método de pago

-- Eliminar columnas de Stripe en la tabla payments
ALTER TABLE payments
  DROP COLUMN IF EXISTS stripe_session_id,
  DROP COLUMN IF EXISTS stripe_payment_intent_id;

-- Eliminar el índice de Stripe si existe
DROP INDEX IF EXISTS idx_payments_stripe_session;

-- Eliminar la función RPC de Stripe
DROP FUNCTION IF EXISTS process_stripe_payment(text, text);
