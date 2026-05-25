-- =============================================================================
-- Migration 150: Fix ag_on_offer_accepted — garantiza ag_driver_monthly_commission_pct
-- y reescribe el trigger completo con comisión por tiers + primera carrera gratis
-- =============================================================================

-- ── Función: comisión según viajes completados ese mes (tiers) ────────────────
CREATE OR REPLACE FUNCTION public.ag_driver_monthly_commission_pct(p_driver_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT CASE
    WHEN COUNT(*) >= 121 THEN 6
    WHEN COUNT(*) >= 71  THEN 8
    WHEN COUNT(*) >= 31  THEN 10
    ELSE 12
  END
  FROM public.ag_trip_requests
  WHERE driver_id    = p_driver_id
    AND status       = 'completed'
    AND completed_at >= date_trunc('month', now());
$$;

-- ── Trigger completo: cobra comisión al aceptar oferta ────────────────────────
CREATE OR REPLACE FUNCTION public.ag_on_offer_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_commission_pct    integer := 0;
  v_commission_amount integer := 0;
  v_final_price       integer := 0;
  v_base              integer := 5000;
  v_completed_trips   integer := 0;
  v_tr                RECORD;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN

    -- Cuántas carreras completadas tiene el conductor
    SELECT COALESCE(metric_trips_completed, 0)
    INTO v_completed_trips
    FROM public.ag_drivers WHERE id = NEW.driver_id;

    -- Primera carrera gratis; a partir de la segunda usa tiers
    IF v_completed_trips >= 1 THEN
      v_commission_pct := public.ag_driver_monthly_commission_pct(NEW.driver_id);
    END IF;

    v_final_price       := NEW.offered_price;
    v_commission_amount := CEIL(v_final_price::numeric * v_commission_pct / 100.0)::integer;

    -- Cancelar otras ofertas pendientes del mismo viaje
    UPDATE public.ag_trip_offers
    SET status = 'cancelled', updated_at = now()
    WHERE trip_request_id = NEW.trip_request_id
      AND id <> NEW.id
      AND status = 'pending';

    SELECT * INTO v_tr FROM public.ag_trip_requests WHERE id = NEW.trip_request_id;

    -- Actualizar solicitud con datos financieros
    UPDATE public.ag_trip_requests SET
      status            = 'accepted',
      driver_id         = NEW.driver_id,
      accepted_offer_id = NEW.id,
      base_fare         = v_base,
      distance_fare     = GREATEST(0, v_final_price - v_base),
      commission_pct    = v_commission_pct,
      commission_amount = v_commission_amount,
      driver_net        = v_final_price - v_commission_amount,
      final_price       = v_final_price,
      updated_at        = now()
    WHERE id = NEW.trip_request_id;

    -- Descontar comisión de la billetera del conductor
    IF v_commission_amount > 0 THEN
      UPDATE public.ag_drivers
      SET wallet_balance = wallet_balance - v_commission_amount
      WHERE id = NEW.driver_id;

      INSERT INTO public.ag_wallet_transactions (driver_id, amount, type, trip_offer_id, description)
      VALUES (
        NEW.driver_id,
        -v_commission_amount,
        'commission',
        NEW.id,
        'Comisión ' || v_commission_pct || '% — viaje $' || v_final_price
      );
    END IF;

    -- Registrar métrica de aceptación
    BEGIN
      INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
      VALUES (NEW.driver_id, 'trip_accepted', NEW.trip_request_id);
    EXCEPTION WHEN OTHERS THEN NULL; END;

    BEGIN
      UPDATE public.ag_drivers
      SET metric_trips_accepted = COALESCE(metric_trips_accepted, 0) + 1
      WHERE id = NEW.driver_id;
    EXCEPTION WHEN OTHERS THEN NULL; END;

  END IF;
  RETURN NEW;
END;
$$;

-- Asegurar que el trigger existe
DROP TRIGGER IF EXISTS trg_offer_accepted ON public.ag_trip_offers;
CREATE TRIGGER trg_offer_accepted
  AFTER UPDATE ON public.ag_trip_offers
  FOR EACH ROW EXECUTE FUNCTION public.ag_on_offer_accepted();
