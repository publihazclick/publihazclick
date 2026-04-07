-- =============================================================================
-- Migration 078: Comisión mensual de referido por Trading Bot AI activo
-- Función que se ejecuta mensualmente (vía cron o manualmente por admin)
-- Acredita el porcentaje configurado sobre el precio del paquete de trading
-- =============================================================================

CREATE OR REPLACE FUNCTION process_trading_bot_referral_commissions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rec         record;
  v_pkg_price   numeric;
  v_result      jsonb;
  v_total       integer := 0;
  v_credited    integer := 0;
BEGIN
  -- Recorrer todos los usuarios con trading bot activo
  FOR v_rec IN
    SELECT utp.user_id, utp.package_id, tbp.price_usd
    FROM user_trading_packages utp
    JOIN trading_bot_packages tbp ON tbp.id = utp.package_id
    WHERE utp.is_active = true
  LOOP
    v_total := v_total + 1;

    -- Convertir USD a COP (aprox 3850)
    v_pkg_price := v_rec.price_usd * 3850;

    -- Intentar acreditar comisión al referidor
    SELECT * INTO v_result FROM credit_referral_commission(
      v_rec.user_id,
      'trading_bot',
      v_pkg_price,
      v_rec.package_id::text,
      'Comisión mensual Trading Bot AI — paquete $' || v_rec.price_usd || ' USD'
    );

    IF (v_result->>'ok')::boolean THEN
      v_credited := v_credited + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('total_checked', v_total, 'commissions_credited', v_credited);
END;
$$;
