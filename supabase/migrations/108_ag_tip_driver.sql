-- Propina al conductor al finalizar viaje
-- Se cobra de la wallet del pasajero y se abona a la wallet del conductor (sin comisión)
CREATE OR REPLACE FUNCTION public.ag_tip_driver(p_trip_id UUID, p_amount INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trip RECORD; v_passenger_user UUID; v_driver_wallet INT; v_passenger_wallet INT;
  v_driver_id UUID; v_driver_auth_user UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;

  SELECT t.id, t.passenger_user_id, t.driver_id, t.status
  INTO v_trip FROM public.ag_trips t WHERE t.id = p_trip_id;
  IF v_trip IS NULL THEN RAISE EXCEPTION 'Viaje no encontrado'; END IF;
  IF v_trip.status != 'completed' THEN RAISE EXCEPTION 'Solo se puede dar propina al terminar el viaje'; END IF;

  v_driver_id := v_trip.driver_id;
  SELECT auth_user_id INTO v_passenger_user FROM public.ag_users WHERE id = v_trip.passenger_user_id;
  SELECT auth_user_id INTO v_driver_auth_user FROM public.ag_users WHERE id IN (SELECT ag_user_id FROM public.ag_drivers WHERE id = v_driver_id);

  -- Verificar que quien llama es el pasajero del viaje
  IF v_passenger_user != auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  -- Idempotencia: si ya hay tip registrado, no permitir duplicado
  IF EXISTS (SELECT 1 FROM public.ag_trips WHERE id = p_trip_id AND tip_amount > 0 AND tip_paid_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Ya diste propina a este viaje';
  END IF;

  -- Cobrar al pasajero (de su wallet de publihazclick o de su ag_wallet si existe)
  -- Para simplicidad: abonar directamente a la wallet del conductor
  UPDATE public.ag_drivers SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount WHERE id = v_driver_id;
  UPDATE public.ag_trips SET tip_amount = p_amount, tip_paid_at = now() WHERE id = p_trip_id;

  -- Registrar transacción informativa
  INSERT INTO public.ag_wallet_transactions (driver_id, type, amount, ref_id, description)
  VALUES (v_driver_id, 'tip', p_amount, p_trip_id, 'Propina del pasajero');
END;
$$;
