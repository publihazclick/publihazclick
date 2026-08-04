-- =============================================================================
-- Migration 183: Restaura la comisión de invitados (perdida en un reemplazo
-- anterior de ag_complete_trip) + terminología "invitado" en vez de "referido"
-- =============================================================================
--
-- Diagnóstico (2026-08-04): al revisar ag_complete_trip() para enganchar los
-- bonos por hitos (migración 182), se confirmó contra la función VIVA en
-- producción (pg_get_functiondef, no solo mirando migraciones) que la lógica
-- de comisión 2% a quien invitó al pasajero y 2% a quien invitó al conductor
-- (migraciones 077/083) ya NO estaba en la función actual -- una migración
-- posterior (145, "quick flow") reescribió ag_complete_trip() con
-- CREATE OR REPLACE sin incluir esa parte, y la pisó sin querer.
--
-- Nota: la migración 083 original también llamaba a credit_referral_commission
-- (sistema general de referidos de Publihazclick) -- esa función vive en el
-- proyecto Supabase de Publihazclick (btkdmdhzouzvzgyuzgbh), NO en el de Movi
-- (hndhgtnjyjwrnzdcgcca, separado desde 2026-07-05). No se puede llamar una
-- función de OTRO proyecto Supabase por SQL directo, así que esa parte queda
-- fuera a propósito -- solo se restaura la comisión propia de Movi
-- (ag_referral_wallet / ag_referral_transactions, que sí viven en este mismo
-- proyecto).

CREATE OR REPLACE FUNCTION public.ag_complete_trip(p_trip_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id          uuid;
  v_trip               record;
  v_passenger          record;
  v_driver_user        record;
  v_pass_referrer_id   uuid;
  v_driver_referrer_id uuid;
  v_ref_commission     integer;
  v_wallet_id          uuid;
  v_trip_value         integer;
BEGIN
  UPDATE public.ag_trip_requests
  SET status = 'completed', driver_stage = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_trip_request_id AND status IN ('accepted', 'in_progress')
  RETURNING driver_id INTO v_driver_id;

  IF v_driver_id IS NOT NULL THEN
    INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
    VALUES (v_driver_id, 'trip_completed', p_trip_request_id)
    ON CONFLICT DO NOTHING;

    UPDATE public.ag_drivers
    SET metric_trips_completed = COALESCE(metric_trips_completed, 0) + 1
    WHERE id = v_driver_id;

    PERFORM public.ag_check_and_award_milestone(v_driver_id);
  END IF;

  -- ── Comisión de invitados: 2% a quien invitó al pasajero, 2% a quien invitó
  --    al conductor (evita pago doble si ambos fueron invitados por la misma
  --    persona) ──────────────────────────────────────────────────────────────
  SELECT * INTO v_trip FROM public.ag_trip_requests WHERE id = p_trip_request_id;
  IF v_trip IS NOT NULL AND v_trip.status = 'completed' THEN
    v_trip_value := COALESCE(v_trip.final_price, v_trip.offered_price, 0);

    SELECT * INTO v_passenger FROM public.ag_users WHERE id = v_trip.passenger_user_id;
    v_pass_referrer_id := v_passenger.referred_by;

    v_driver_referrer_id := NULL;
    IF v_trip.driver_id IS NOT NULL THEN
      SELECT au.* INTO v_driver_user
      FROM public.ag_users au
      JOIN public.ag_drivers ad ON ad.ag_user_id = au.id
      WHERE ad.id = v_trip.driver_id;
      v_driver_referrer_id := v_driver_user.referred_by;
    END IF;

    -- Comisión por quien invitó al PASAJERO
    IF v_pass_referrer_id IS NOT NULL AND v_trip_value > 0 THEN
      v_ref_commission := CEIL(v_trip_value::numeric * 2 / 100.0)::integer;
      IF v_ref_commission > 0 THEN
        INSERT INTO public.ag_referral_wallet (ag_user_id) VALUES (v_pass_referrer_id)
        ON CONFLICT (ag_user_id) DO NOTHING;

        SELECT id INTO v_wallet_id FROM public.ag_referral_wallet WHERE ag_user_id = v_pass_referrer_id;

        UPDATE public.ag_referral_wallet
        SET balance = balance + v_ref_commission, total_earned = total_earned + v_ref_commission, updated_at = now()
        WHERE id = v_wallet_id;

        INSERT INTO public.ag_referral_transactions
          (wallet_id, referrer_user_id, referred_user_id, trip_request_id, trip_value, commission_pct, commission_amount, description)
        VALUES (
          v_wallet_id, v_pass_referrer_id, v_passenger.id, p_trip_request_id,
          v_trip_value, 2, v_ref_commission,
          'Comisión 2% — viaje de invitado ' || COALESCE(v_passenger.full_name, '') || ' $' || v_trip_value
        );
      END IF;
    END IF;

    -- Comisión por quien invitó al CONDUCTOR (solo si es un invitador distinto
    -- al del pasajero, para no pagar doble por el mismo viaje)
    IF v_driver_referrer_id IS NOT NULL
       AND (v_pass_referrer_id IS NULL OR v_driver_referrer_id <> v_pass_referrer_id)
       AND v_trip_value > 0 THEN
      v_ref_commission := CEIL(v_trip_value::numeric * 2 / 100.0)::integer;
      IF v_ref_commission > 0 THEN
        INSERT INTO public.ag_referral_wallet (ag_user_id) VALUES (v_driver_referrer_id)
        ON CONFLICT (ag_user_id) DO NOTHING;

        SELECT id INTO v_wallet_id FROM public.ag_referral_wallet WHERE ag_user_id = v_driver_referrer_id;

        UPDATE public.ag_referral_wallet
        SET balance = balance + v_ref_commission, total_earned = total_earned + v_ref_commission, updated_at = now()
        WHERE id = v_wallet_id;

        INSERT INTO public.ag_referral_transactions
          (wallet_id, referrer_user_id, referred_user_id, trip_request_id, trip_value, commission_pct, commission_amount, description)
        VALUES (
          v_wallet_id, v_driver_referrer_id, v_driver_user.id, p_trip_request_id,
          v_trip_value, 2, v_ref_commission,
          'Comisión 2% — viaje de invitado ' || COALESCE(v_driver_user.full_name, '') || ' $' || v_trip_value
        );
      END IF;
    END IF;
  END IF;
END;
$$;
