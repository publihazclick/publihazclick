-- =============================================================================
-- Migración 133: flag ai_free_access — usuarios demo que no pagan por IA
-- =============================================================================
-- Para cuentas internas / demo (ej. tecnomultimedias) que necesitan usar
-- todas las herramientas IA sin recargar. La función charge_ai_action
-- respeta la flag: registra la transacción como tipo 'bonus' con amount=0
-- para mantener auditoría, pero no descuenta del wallet.
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_free_access boolean NOT NULL DEFAULT false;

-- Reescribir charge_ai_action con soporte para free_access
CREATE OR REPLACE FUNCTION public.charge_ai_action(
  p_user_id uuid,
  p_action_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price     integer;
  v_cost      integer;
  v_label     text;
  v_active    boolean;
  v_balance   integer;
  v_wallet_id uuid;
  v_free      boolean;
BEGIN
  -- 1. Obtener precio
  SELECT price_cop, cost_cop, label, is_active
  INTO v_price, v_cost, v_label, v_active
  FROM ai_action_pricing WHERE id = p_action_id;

  IF v_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acción no encontrada: ' || p_action_id);
  END IF;

  IF NOT COALESCE(v_active, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta acción no está disponible temporalmente');
  END IF;

  -- 2. Asegurar wallet
  PERFORM ai_ensure_wallet(p_user_id);

  -- 3. ¿Usuario con acceso gratis?
  SELECT COALESCE(ai_free_access, false) INTO v_free
  FROM profiles WHERE id = p_user_id;

  -- 4. Bypass: si tiene acceso gratis, registramos sin descontar
  IF COALESCE(v_free, false) THEN
    SELECT id, balance INTO v_wallet_id, v_balance
    FROM ai_wallets WHERE user_id = p_user_id;

    INSERT INTO ai_wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, metadata)
    VALUES (
      v_wallet_id,
      p_user_id,
      'bonus',
      0,
      v_balance,
      v_label || ' (acceso demo)',
      jsonb_build_object(
        'action_id', p_action_id,
        'price_cop', v_price,
        'cost_cop',  v_cost,
        'free_access', true
      ) || p_metadata
    );

    RETURN jsonb_build_object(
      'ok', true,
      'charged', 0,
      'balance_after', v_balance,
      'action', v_label,
      'free_access', true
    );
  END IF;

  -- 5. Flujo normal: verificar saldo
  SELECT id, balance INTO v_wallet_id, v_balance
  FROM ai_wallets WHERE user_id = p_user_id;

  IF v_balance < v_price THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Saldo insuficiente. Necesitas ' || v_price || ' COP. Tienes ' || v_balance || ' COP.',
      'required', v_price,
      'balance', v_balance,
      'need_recharge', true
    );
  END IF;

  -- 6. Descontar
  UPDATE ai_wallets
  SET balance = balance - v_price,
      total_consumed = total_consumed + v_price,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- 7. Registrar transacción
  INSERT INTO ai_wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, metadata)
  VALUES (
    v_wallet_id,
    p_user_id,
    'consumption',
    -v_price,
    v_balance - v_price,
    v_label,
    jsonb_build_object(
      'action_id', p_action_id,
      'price_cop', v_price,
      'cost_cop',  v_cost,
      'margin_cop', v_price - v_cost
    ) || p_metadata
  );

  RETURN jsonb_build_object(
    'ok', true,
    'charged', v_price,
    'balance_after', v_balance - v_price,
    'action', v_label,
    'margin', v_price - v_cost
  );
END;
$$;

-- Activar acceso gratis para tecnomultimedias
UPDATE profiles
SET ai_free_access = true
WHERE id = 'c6d5c59c-b1e0-4495-9386-70c99ebb2963';
