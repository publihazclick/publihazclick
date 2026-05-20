-- Primera carrera del conductor sin comisión (prueba de la plataforma)
-- A partir de la segunda, se aplica el % configurado (actualmente 12%)

CREATE OR REPLACE FUNCTION public.ag_on_offer_accepted()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_commission_pct    integer := 0;
  v_commission_amount integer := 0;
  v_final_price       integer := 0;
  v_tr                RECORD;
  v_base              integer := 5000;
  v_completed_trips   integer := 0;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN

    -- Verificar cuántas carreras completadas tiene el conductor
    SELECT COALESCE(metric_trips_completed, 0) INTO v_completed_trips
    FROM public.ag_drivers WHERE id = NEW.driver_id;

    -- Solo cobrar comisión a partir de la segunda carrera
    IF v_completed_trips >= 1 THEN
      SELECT COALESCE(value::integer, 0) INTO v_commission_pct
      FROM public.platform_settings WHERE key = 'ag_commission_pct';
    END IF;

    v_commission_amount := CEIL(NEW.offered_price::numeric * v_commission_pct / 100.0)::integer;
    v_final_price := NEW.offered_price;

    -- Cancelar las demás ofertas pendientes del mismo viaje
    UPDATE public.ag_trip_offers
    SET status = 'cancelled', updated_at = now()
    WHERE trip_request_id = NEW.trip_request_id AND id <> NEW.id AND status = 'pending';

    SELECT * INTO v_tr FROM public.ag_trip_requests WHERE id = NEW.trip_request_id;

    UPDATE public.ag_trip_requests SET
      status = 'accepted',
      driver_id = NEW.driver_id,
      accepted_offer_id = NEW.id,
      base_fare = v_base,
      distance_fare = GREATEST(0, v_final_price - v_base),
      commission_pct = v_commission_pct,
      commission_amount = v_commission_amount,
      driver_net = v_final_price - v_commission_amount,
      final_price = v_final_price,
      updated_at = now()
    WHERE id = NEW.trip_request_id;

    IF v_commission_amount > 0 THEN
      UPDATE public.ag_drivers SET wallet_balance = wallet_balance - v_commission_amount
      WHERE id = NEW.driver_id;

      INSERT INTO public.ag_wallet_transactions (driver_id, amount, type, trip_offer_id, description)
      VALUES (NEW.driver_id, -v_commission_amount, 'commission', NEW.id,
              'Comisión ' || v_commission_pct || '% — viaje $' || v_final_price);
    END IF;

    -- Registrar métrica aceptación
    INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
    VALUES (NEW.driver_id, 'trip_accepted', NEW.trip_request_id);
    UPDATE public.ag_drivers SET metric_trips_accepted = metric_trips_accepted + 1
    WHERE id = NEW.driver_id;

  END IF;
  RETURN NEW;
END;
$$;
