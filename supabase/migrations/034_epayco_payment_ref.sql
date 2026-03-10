-- ============================================================
-- Migración 034: Columna epayco_ref_payco en payments
-- ============================================================

ALTER TABLE payments ADD COLUMN IF NOT EXISTS epayco_ref_payco TEXT;

CREATE INDEX IF NOT EXISTS idx_payments_epayco_ref
  ON payments(epayco_ref_payco)
  WHERE epayco_ref_payco IS NOT NULL;
