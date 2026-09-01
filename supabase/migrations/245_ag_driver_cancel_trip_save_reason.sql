-- Migration 245: guardar el motivo real en ag_driver_cancel_trip
--
-- Contexto (2026-09-01): al conectar por primera vez un botón real de "Cancelar viaje"
-- para el conductor (el RPC ya existía desde la migración 115 pero nunca tuvo botón
-- en la app), se encontró que el UPDATE dentro de ag_driver_cancel_trip nunca guardaba
-- p_reason en la columna cancel_reason -- el parámetro se recibía y se ignoraba
-- silenciosamente. El camino del pasajero (cancelTripRequest, cliente) sí lo guarda.
-- Se agrega la columna al UPDATE para que el motivo que el conductor selecciona en el
-- modal (ver anda-gana.component.ts, cancelReasonTarget==='driver') quede registrado
-- igual que en el camino del pasajero.

CREATE OR REPLACE FUNCTION public.ag_driver_cancel_trip(p_trip_request_id uuid, p_reason text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  SELECT d.id INTO v_driver_id
  FROM public.ag_drivers d
  JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'No driver'; END IF;

  UPDATE public.ag_trip_requests
  SET status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason, updated_at = now()
  WHERE id = p_trip_request_id AND driver_id = v_driver_id AND status IN ('accepted');

  INSERT INTO public.ag_driver_metric_events (driver_id, event_type, trip_id)
  VALUES (v_driver_id, 'trip_cancelled_self', p_trip_request_id);
  UPDATE public.ag_drivers SET metric_trips_cancelled_self = metric_trips_cancelled_self + 1
  WHERE id = v_driver_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_driver_cancel_trip(uuid, text) TO authenticated;
