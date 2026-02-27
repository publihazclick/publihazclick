-- =============================================================================
-- Migration 024: Add dlocal_payment_id column to payments
-- =============================================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS dlocal_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_dlocal
  ON payments(dlocal_payment_id)
  WHERE dlocal_payment_id IS NOT NULL;
