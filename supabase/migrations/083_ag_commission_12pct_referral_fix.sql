-- =============================================================================
-- Migration 083: Comisión 12% + fix referido duplicado
-- - Comisión plataforma: 12%
-- - Referido: 2% del valor de la carrera
-- - Si ambos (conductor y pasajero) fueron referidos por la MISMA persona: solo 2%
-- =============================================================================

-- ── Actualizar comisión a 12% ──
INSERT INTO platform_settings (key, value)
VALUES ('ag_commission_pct', '12')
ON CONFLICT (key) DO UPDATE SET value = '12';

-- ── Reemplazar función de completar viaje ──
CREATE OR REPLACE FUNCTION ag_complete_trip(p_trip_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trip              record;
  v_passenger         record;
  v_driver_user       record;
  v_pass_referrer_id  uuid;
  v_driver_referrer_id uuid;
  v_commission        integer;
  v_wallet_id         uuid;
BEGIN
  -- Marcar viaje como completado
  UPDATE ag_trip_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_trip_request_id AND status = 'accepted';

  -- Obtener datos del viaje
  SELECT * INTO v_trip FROM ag_trip_requests WHERE id = p_trip_request_id;
  IF v_trip IS NULL OR v_trip.status <> 'completed' THEN RETURN; END IF;

  -- Obtener referidor del PASAJERO
  SELECT * INTO v_passenger FROM ag_users WHERE id = v_trip.passenger_user_id;
  v_pass_referrer_id := v_passenger.referred_by;

  -- Obtener referidor del CONDUCTOR
  v_driver_referrer_id := NULL;
  IF v_trip.driver_id IS NOT NULL THEN
    SELECT au.* INTO v_driver_user
    FROM ag_users au
    JOIN ag_drivers ad ON ad.ag_user_id = au.id
    WHERE ad.id = v_trip.driver_id;
    v_driver_referrer_id := v_driver_user.referred_by;
  END IF;

  -- ── Comisión 2% por referido del PASAJERO ──
  IF v_pass_referrer_id IS NOT NULL THEN
    v_commission := CEIL(v_trip.offered_price::numeric * 2 / 100.0)::integer;

    IF v_commission > 0 THEN
      INSERT INTO ag_referral_wallet (ag_user_id) VALUES (v_pass_referrer_id)
      ON CONFLICT (ag_user_id) DO NOTHING;

      SELECT id INTO v_wallet_id FROM ag_referral_wallet WHERE ag_user_id = v_pass_referrer_id;

      UPDATE ag_referral_wallet
      SET balance = balance + v_commission, total_earned = total_earned + v_commission, updated_at = now()
      WHERE id = v_wallet_id;

      INSERT INTO ag_referral_transactions
        (wallet_id, referrer_user_id, referred_user_id, trip_request_id, trip_value, commission_pct, commission_amount, description)
      VALUES (
        v_wallet_id, v_pass_referrer_id, v_passenger.id, p_trip_request_id,
        v_trip.offered_price, 2, v_commission,
        'Comisión 2% — viaje pasajero ' || v_passenger.full_name || ' $' || v_trip.offered_price
      );
    END IF;
  END IF;

  -- ── Comisión 2% por referido del CONDUCTOR ──
  -- SOLO si el referidor del conductor es DIFERENTE al del pasajero (evitar pago doble)
  IF v_driver_referrer_id IS NOT NULL
     AND (v_pass_referrer_id IS NULL OR v_driver_referrer_id <> v_pass_referrer_id) THEN
    v_commission := CEIL(v_trip.offered_price::numeric * 2 / 100.0)::integer;

    IF v_commission > 0 THEN
      INSERT INTO ag_referral_wallet (ag_user_id) VALUES (v_driver_referrer_id)
      ON CONFLICT (ag_user_id) DO NOTHING;

      SELECT id INTO v_wallet_id FROM ag_referral_wallet WHERE ag_user_id = v_driver_referrer_id;

      UPDATE ag_referral_wallet
      SET balance = balance + v_commission, total_earned = total_earned + v_commission, updated_at = now()
      WHERE id = v_wallet_id;

      INSERT INTO ag_referral_transactions
        (wallet_id, referrer_user_id, referred_user_id, trip_request_id, trip_value, commission_pct, commission_amount, description)
      VALUES (
        v_wallet_id, v_driver_referrer_id, v_driver_user.id, p_trip_request_id,
        v_trip.offered_price, 2, v_commission,
        'Comisión 2% — viaje conductor ' || v_driver_user.full_name || ' $' || v_trip.offered_price
      );
    END IF;
  END IF;

  -- ── Comisión PubliHazClick (módulo movi) para el referidor principal ──
  IF v_passenger IS NOT NULL AND v_passenger.auth_user_id IS NOT NULL THEN
    PERFORM credit_referral_commission(
      v_passenger.auth_user_id,
      'movi',
      v_trip.offered_price::numeric,
      p_trip_request_id::text,
      'Comisión Movi — viaje de invitado directo'
    );
  END IF;

END;
$$;
