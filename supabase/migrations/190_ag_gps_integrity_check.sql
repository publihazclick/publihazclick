-- =============================================================================
-- Migration 190: Chequeo automático de integridad GPS al completar un viaje --
-- pedido explícito del usuario 2026-08-05: usar la correlación GPS (migración
-- 189) para marcar como sospechoso un viaje donde conductor y pasajero NO
-- estuvieron cerca durante el trayecto, en vez de confiar solo en los botones
-- de etapa (que ya están validados por GPS puntual, pero no por el recorrido
-- completo).
--
-- Importante -- a propósito NO bloquea ni penaliza nada automáticamente:
-- solo deja marcado gps_integrity_flagged = true para revisión manual (panel
-- admin). Bloquear pagos automáticamente con este umbral sin haber calibrado
-- contra viajes reales sería arriesgado (falsos positivos en autopista, zonas
-- con mala señal, etc.) -- primero se acumula evidencia, después se decide
-- si algún día se usa para negar un bono o abrir un caso automático.
-- =============================================================================

ALTER TABLE public.ag_trip_requests
  ADD COLUMN IF NOT EXISTS gps_integrity_checked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_integrity_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gps_integrity_detail  jsonb;

CREATE INDEX IF NOT EXISTS ag_trip_requests_gps_flagged_idx
  ON public.ag_trip_requests (gps_integrity_flagged) WHERE gps_integrity_flagged = true;

-- ── Corre la correlación ya existente (ag_get_trip_gps_correlation) y decide
--    si el viaje queda marcado. Umbral: 300m de separación promedio -- mismo
--    radio de tolerancia que ya usa ag_advance_trip_stage para validar que el
--    conductor esté cerca del origen/destino, así queda consistente en toda
--    la plataforma. Exige al menos 3 puntos emparejados para decidir: con
--    menos datos (app vieja, GPS apagado, viaje muy corto) no hay evidencia
--    suficiente y NO se marca como sospechoso, solo se deja sin marcar. ──────
CREATE OR REPLACE FUNCTION public.ag_check_trip_gps_integrity(p_trip_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_correlation jsonb;
  v_avg_km      numeric;
  v_samples     integer;
  v_flagged     boolean := false;
  v_reason      text := NULL;
BEGIN
  v_correlation := public.ag_get_trip_gps_correlation(p_trip_request_id);
  v_avg_km  := (v_correlation->>'avg_km')::numeric;
  v_samples := (v_correlation->>'sample_points')::integer;

  IF v_samples >= 3 AND v_avg_km > 0.3 THEN
    v_flagged := true;
    v_reason := 'Separación GPS promedio de ' || v_avg_km || ' km entre conductor y pasajero durante el viaje (' || v_samples || ' puntos comparados)';
  END IF;

  UPDATE public.ag_trip_requests
  SET gps_integrity_checked = true,
      gps_integrity_flagged = v_flagged,
      gps_integrity_detail = v_correlation || jsonb_build_object('reason', v_reason)
  WHERE id = p_trip_request_id;
END;
$$;

-- ── ag_complete_trip: se agrega la llamada al chequeo justo después de
--    registrar la métrica de viaje completado y el milestone. Se reproduce
--    la función completa porque CREATE OR REPLACE la sobreescribe entera. ──
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
    PERFORM public.ag_check_trip_gps_integrity(p_trip_request_id);
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
