-- =============================================================================
-- Migration 178: Wallet SMS ilimitada — usuarios exentos de recarga
-- =============================================================================
-- Permite marcar ciertos usuarios (ej. cuentas de cortesía) para que envíen
-- SMS Masivos sin necesidad de saldo propio en su sms_wallet. El costo real
-- se sigue pagando desde el saldo de Telnyx del dueño de la plataforma.

ALTER TABLE sms_wallets
  ADD COLUMN IF NOT EXISTS unlimited boolean NOT NULL DEFAULT false;

-- Asegurar wallet y marcarla como ilimitada para turismohermosacolombia@gmail.com
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'turismohermosacolombia@gmail.com';

  IF v_user_id IS NOT NULL THEN
    PERFORM sms_ensure_wallet(v_user_id);

    UPDATE sms_wallets
      SET unlimited = true,
          updated_at = now()
      WHERE user_id = v_user_id;
  END IF;
END $$;
