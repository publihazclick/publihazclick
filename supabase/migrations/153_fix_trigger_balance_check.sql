-- Migration 153: Agregar validación de saldo en ag_on_offer_accepted
-- Antes se descontaba comisión sin verificar si el conductor tenía saldo suficiente.
-- Ahora RAISE EXCEPTION 'SALDO_INSUFICIENTE' si el saldo es insuficiente.

CREATE OR REPLACE FUNCTION public.ag_on_offer_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_commission_pct    integer := 0;
  v_commission_amount integer := 0;
  v_final_price       integer := 0;
  v_base              integer := 5000;
  v_completed_trips   integer := 0;
  v_wallet_balance    integer := 0;
  v_tr                RECORD;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN

    SELECT COALESCE(metric_trips_completed, 0), COALESCE(wallet_balance, 0)
    INTO v_completed_trips, v_wallet_balance
    FROM public.ag_drivers WHERE id = NEW.driver_id;

    -- Primera carrera gratis; a partir de la segunda usa tiers
    IF v_completed_trips >= 1 THEN
      v_commission_pct := public.ag_driver_monthly_commission_pct(NEW.driver_id);
    END IF;

    v_final_price       := NEW.offered_price;
    v_commission_amount := CEIL(v_final_price::numeric * v_commission_pct / 100.0)::integer;

    -- Validar saldo antes de descontar
    IF v_commission_amount > 0 AND v_wallet_balance < v_commission_amount THEN
      RAISE EXCEPTION 'SALDO_INSUFICIENTE — Necesita $% pero tiene $%',
        v_commission_amount, v_wallet_balance;
    END IF;

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
