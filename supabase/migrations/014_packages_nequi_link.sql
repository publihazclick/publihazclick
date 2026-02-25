-- =============================================================================
-- Migration 014: Agregar link de pago Nequi a paquetes + funciones de aprobación
-- =============================================================================

-- ── Columna nequi_payment_link en packages ────────────────────────────────────
ALTER TABLE packages ADD COLUMN IF NOT EXISTS nequi_payment_link TEXT;

-- ── Política INSERT para usuarios en payments (faltaba en 013) ────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payments' AND policyname = 'Users can insert own payments'
  ) THEN
    CREATE POLICY "Users can insert own payments"
      ON payments FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Reemplazar política de service_role por una de admins (más apropiada)
DROP POLICY IF EXISTS "Service role full access" ON payments;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payments' AND policyname = 'Admins can manage all payments'
  ) THEN
    CREATE POLICY "Admins can manage all payments"
      ON payments FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'dev')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid() AND role IN ('admin', 'dev')
        )
      );
  END IF;
END $$;

-- ── Función: aprobar pago manual (admin) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION approve_payment(p_payment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment RECORD;
  v_up_id UUID;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id AND status = 'pending';
  IF v_payment.id IS NULL THEN RETURN FALSE; END IF;

  UPDATE payments SET status = 'approved', updated_at = NOW() WHERE id = p_payment_id;
  PERFORM activate_user_package(v_payment.user_id, v_payment.package_id);

  SELECT id INTO v_up_id FROM user_packages
  WHERE user_id = v_payment.user_id AND package_id = v_payment.package_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_up_id IS NOT NULL THEN
    UPDATE user_packages
    SET payment_method = 'nequi', payment_id = v_payment.gateway_transaction_id
    WHERE id = v_up_id;
  END IF;

  RETURN TRUE;
END;
$$;

-- ── Función: rechazar pago manual (admin) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION reject_payment(p_payment_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE payments
  SET status = 'declined', error_message = p_reason, updated_at = NOW()
  WHERE id = p_payment_id AND status = 'pending';
  RETURN FOUND;
END;
$$;

-- =============================================================================
-- FIN
-- =============================================================================
