-- Flujo conductor "primer viaje gratis":
-- quick       = recién registrado vía 3 pasos, puede aceptar SU PRIMER viaje sin docs ni wallet
-- pending_docs = completó su primer viaje, debe enviar documentación completa
-- pending     = docs enviados, esperando aprobación 24h
-- approved    = verificado, puede aceptar viajes si wallet >= 20000 COP

-- Ampliar CHECK de status
ALTER TABLE public.ag_drivers DROP CONSTRAINT IF EXISTS ag_drivers_status_check;
ALTER TABLE public.ag_drivers ADD CONSTRAINT ag_drivers_status_check
  CHECK (status IN ('quick','pending','pending_docs','approved','rejected'));

-- ag_complete_trip: si el conductor era 'quick', pasa a 'pending_docs'
CREATE OR REPLACE FUNCTION public.ag_complete_trip(p_trip_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id    uuid;
  v_passenger_id uuid;
  v_final_price  int;
  v_new_trips    int;
BEGIN
  UPDATE public.ag_trip_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_trip_request_id AND status = 'accepted'
  RETURNING driver_id, passenger_user_id, COALESCE(final_price, offered_price)
  INTO v_driver_id, v_passenger_id, v_final_price;

  IF v_driver_id IS NOT NULL THEN
    INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
    VALUES (v_driver_id, 'trip_completed', p_trip_request_id);

    -- Incrementar viajes completados y, si era 'quick', pasar a 'pending_docs'
    UPDATE public.ag_drivers
    SET metric_trips_completed = metric_trips_completed + 1,
        status = CASE WHEN status = 'quick' THEN 'pending_docs' ELSE status END
    WHERE id = v_driver_id;
  END IF;

  IF v_passenger_id IS NOT NULL THEN
    UPDATE public.ag_users
    SET total_trips_as_passenger = total_trips_as_passenger + 1,
        loyalty_points = loyalty_points + 10,
        passenger_level = public.ag_passenger_level_from_trips(total_trips_as_passenger + 1)
    WHERE id = v_passenger_id
    RETURNING total_trips_as_passenger INTO v_new_trips;
  END IF;
END;
$$;
