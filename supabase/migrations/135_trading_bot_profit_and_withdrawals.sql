-- =============================================================================
-- 135: Trading Bot AI — Balance de rentabilidad + retiro cada 30 días
-- ----------------------------------------------------------------------------
-- Requisitos del negocio:
--   * A los 30 días de activación, se acredita rentabilidad = price_usd * %
--     global (platform_settings.trading_monthly_return_pct).
--   * Usuario puede solicitar retiro. Después del primer retiro debe esperar
--     otros 30 días.
--   * Admin recibe la solicitud en su panel y la procesa.
-- =============================================================================

-- ── 1) Columnas de balance y control en user_trading_packages ────────────────
ALTER TABLE user_trading_packages
  ADD COLUMN IF NOT EXISTS profit_balance_usd     NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid_returns_usd NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_withdrawn_profit NUMERIC(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_return_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_withdrawal_at     TIMESTAMPTZ;

-- ── 2) Función de accrual: acredita rentabilidad cada 30 días ───────────────
CREATE OR REPLACE FUNCTION accrue_trading_bot_returns()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec          record;
  v_global_pct   numeric;
  v_amount       numeric;
  v_total        integer := 0;
  v_credited     integer := 0;
  v_total_amount numeric := 0;
BEGIN
  SELECT COALESCE(NULLIF(value,'')::numeric, 30)
    INTO v_global_pct
  FROM platform_settings
  WHERE key = 'trading_monthly_return_pct';

  IF v_global_pct IS NULL THEN v_global_pct := 30; END IF;

  FOR v_rec IN
    SELECT utp.id, utp.user_id, utp.activated_at, utp.last_return_at,
           utp.profit_balance_usd, tbp.name AS package_name, tbp.price_usd
    FROM user_trading_packages utp
    JOIN trading_bot_packages  tbp ON tbp.id = utp.package_id
    WHERE utp.is_active = true
      AND (
        (utp.last_return_at IS NULL  AND utp.activated_at   <= now() - interval '30 days')
        OR
        (utp.last_return_at IS NOT NULL AND utp.last_return_at <= now() - interval '30 days')
      )
  LOOP
    v_total  := v_total + 1;
    v_amount := ROUND(v_rec.price_usd * v_global_pct / 100.0, 4);
    IF v_amount <= 0 THEN CONTINUE; END IF;

    UPDATE user_trading_packages
    SET profit_balance_usd     = profit_balance_usd + v_amount,
        total_paid_returns_usd = total_paid_returns_usd + v_amount,
        last_return_at         = now(),
        updated_at             = now()
    WHERE id = v_rec.id;

    v_credited     := v_credited + 1;
    v_total_amount := v_total_amount + v_amount;
  END LOOP;

  RETURN jsonb_build_object(
    'checked',         v_total,
    'credited',        v_credited,
    'total_usd',       v_total_amount,
    'return_pct_used', v_global_pct
  );
END;
$$;


-- ── 3) Acreditación defensiva por paquete (llamada al abrir la pantalla) ────
-- El cron diario es la fuente principal, pero si por cualquier motivo no
-- corrió, el cliente puede invocar este RPC para su propio paquete y asegurar
-- que la rentabilidad esté al día.
CREATE OR REPLACE FUNCTION ensure_trading_bot_accrual(p_user_trading_package_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id    uuid;
  v_utp        user_trading_packages;
  v_pkg_price  numeric;
  v_global_pct numeric;
  v_cycles     int := 0;
  v_amount     numeric;
  v_total      numeric := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_utp
  FROM user_trading_packages
  WHERE id = p_user_trading_package_id AND user_id = v_user_id;
  IF v_utp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'package_not_found');
  END IF;
  IF NOT v_utp.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'package_inactive');
  END IF;

  SELECT price_usd INTO v_pkg_price FROM trading_bot_packages WHERE id = v_utp.package_id;

  SELECT COALESCE(NULLIF(value,'')::numeric, 30) INTO v_global_pct
  FROM platform_settings WHERE key = 'trading_monthly_return_pct';

  -- Abonar todos los ciclos de 30 días pendientes (por si acumuló varios)
  WHILE (
    (v_utp.last_return_at IS NULL    AND v_utp.activated_at   <= now() - interval '30 days') OR
    (v_utp.last_return_at IS NOT NULL AND v_utp.last_return_at <= now() - interval '30 days')
  ) LOOP
    v_amount := ROUND(v_pkg_price * v_global_pct / 100.0, 4);
    IF v_amount <= 0 THEN EXIT; END IF;

    UPDATE user_trading_packages
    SET profit_balance_usd     = profit_balance_usd + v_amount,
        total_paid_returns_usd = total_paid_returns_usd + v_amount,
        last_return_at         = COALESCE(last_return_at, activated_at) + interval '30 days',
        updated_at             = now()
    WHERE id = v_utp.id
    RETURNING * INTO v_utp;

    v_cycles := v_cycles + 1;
    v_total  := v_total  + v_amount;

    -- Safety cap
    IF v_cycles >= 24 THEN EXIT; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',                   true,
    'cycles_credited',      v_cycles,
    'total_credited_usd',   v_total,
    'profit_balance_usd',   v_utp.profit_balance_usd,
    'last_return_at',       v_utp.last_return_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_trading_bot_accrual(uuid) TO authenticated;


-- ── 4) Solicitud de retiro de rentabilidad ──────────────────────────────────
CREATE OR REPLACE FUNCTION request_trading_profit_withdrawal(
  p_user_trading_package_id uuid,
  p_amount_usd              numeric,
  p_full_name               text,
  p_account_number          text,
  p_account_type            text DEFAULT 'ahorros',
  p_bank                    text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id      uuid;
  v_utp          user_trading_packages;
  v_pkg          trading_bot_packages;
  v_days_active  int;
  v_days_since_w int;
  v_withdraw_id  uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_utp FROM user_trading_packages
  WHERE id = p_user_trading_package_id AND user_id = v_user_id;
  IF v_utp.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'package_not_found');
  END IF;
  IF NOT v_utp.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'package_inactive');
  END IF;

  v_days_active := EXTRACT(DAY FROM (now() - v_utp.activated_at))::int;
  IF v_days_active < 30 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_yet_eligible',
      'days_active', v_days_active,
      'available_at', v_utp.activated_at + interval '30 days'
    );
  END IF;

  -- Regla: primer retiro permitido a los 30 días; siguientes, cada 30 días
  IF v_utp.last_withdrawal_at IS NOT NULL THEN
    v_days_since_w := EXTRACT(DAY FROM (now() - v_utp.last_withdrawal_at))::int;
    IF v_days_since_w < 30 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'withdrawal_cooldown',
        'days_since_last', v_days_since_w,
        'available_at', v_utp.last_withdrawal_at + interval '30 days'
      );
    END IF;
  END IF;

  IF p_amount_usd IS NULL OR p_amount_usd <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;
  IF p_amount_usd > v_utp.profit_balance_usd THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'amount_exceeds_balance',
      'profit_balance_usd', v_utp.profit_balance_usd
    );
  END IF;

  SELECT * INTO v_pkg FROM trading_bot_packages WHERE id = v_utp.package_id;

  UPDATE user_trading_packages
  SET profit_balance_usd     = profit_balance_usd - p_amount_usd,
      total_withdrawn_profit = total_withdrawn_profit + p_amount_usd,
      last_withdrawal_at     = now(),
      updated_at             = now()
  WHERE id = p_user_trading_package_id;

  INSERT INTO withdrawal_requests (user_id, amount, method, details, status)
  VALUES (
    v_user_id,
    p_amount_usd,
    'trading_profit',
    jsonb_build_object(
      'type',                    'trading_profit',
      'user_trading_package_id', v_utp.id,
      'package_id',              v_utp.package_id,
      'package_name',            v_pkg.name,
      'price_usd',               v_pkg.price_usd,
      'amount_usd',              p_amount_usd,
      'full_name',               p_full_name,
      'account_number',          p_account_number,
      'account_type',            p_account_type,
      'bank',                    p_bank,
      'days_active',             v_days_active
    ),
    'pending'
  )
  RETURNING id INTO v_withdraw_id;

  RETURN jsonb_build_object(
    'ok',                    true,
    'withdrawal_request_id', v_withdraw_id,
    'amount_usd',            p_amount_usd,
    'profit_balance_after',  v_utp.profit_balance_usd - p_amount_usd
  );
END;
$$;

GRANT EXECUTE ON FUNCTION request_trading_profit_withdrawal(uuid, numeric, text, text, text, text) TO authenticated;


-- ── 5) RPC admin: restaurar monto al balance si se rechaza un retiro ───────
CREATE OR REPLACE FUNCTION admin_restore_trading_profit(
  p_user_trading_package_id uuid,
  p_amount_usd              numeric,
  p_withdrawal_id           uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS NULL OR v_role NOT IN ('admin','dev') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  UPDATE user_trading_packages
  SET profit_balance_usd     = profit_balance_usd + p_amount_usd,
      total_withdrawn_profit = GREATEST(0, total_withdrawn_profit - p_amount_usd),
      updated_at             = now()
  WHERE id = p_user_trading_package_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION admin_restore_trading_profit(uuid, numeric, uuid) TO authenticated;


-- ── 6) Cron diario de accrual (01:00 UTC) ───────────────────────────────────
SELECT cron.unschedule('tb-accrue-returns')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tb-accrue-returns');

SELECT cron.schedule(
  'tb-accrue-returns',
  '0 1 * * *',
  $cron$ SELECT accrue_trading_bot_returns(); $cron$
);
