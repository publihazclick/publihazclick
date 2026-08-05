-- =============================================================================
-- Migration 188: Reembolso de comisión en cancelación + validación GPS real de
-- las etapas del viaje (pedido explícito del usuario 2026-08-04)
-- =============================================================================
--
-- PARTE 1: hoy, si un viaje se cancela después de aceptado (comisión ya
-- cobrada), NUNCA se le devuelve nada al conductor -- ni el camino de
-- cancelación del pasajero (un UPDATE crudo sin lógica de negocio) ni el del
-- conductor (RPC ag_driver_cancel_trip) tocan la plata. Se agrega un trigger
-- sobre la tabla misma (no un RPC más) para que aplique sin importar por cuál
-- camino se cancele -- incluyendo cualquiera que se agregue en el futuro.
--
-- Regla: si el pasajero NUNCA llegó a abordar (driver_stage nulo,
-- 'heading_to_pickup' o 'arrived_at_pickup'), el viaje no se hizo -> se
-- devuelve el 100% de la comisión. Si ya estaba 'picked_up'/'on_route' en
-- adelante, el pasajero ya iba en el vehículo -> el viaje se considera hecho,
-- no se devuelve nada. No depende de quién cancela -- depende de si hubo
-- servicio real. Las cancelaciones propias del conductor ya se cuentan aparte
-- (metric_trips_cancelled_self) para detectar conductores que cancelan mucho.
--
-- PARTE 2: hasta ahora, "llegué al punto de recogida" / "pasajero a bordo" /
-- etc. eran un UPDATE crudo desde el cliente -- CUALQUIER conductor podía
-- marcar cualquier etapa sin estar cerca de verdad, lo cual además de ser
-- injusto para el pasajero, podía inflar metric_trips_completed de forma
-- falsa y ganar los bonos por hitos de viajes (migración 182) sin haber
-- llevado a nadie. Se reemplaza por un RPC que valida el GPS REAL del
-- conductor (ag_driver_locations, ya se actualiza solo mientras está en
-- línea) contra el punto de recogida/destino antes de aceptar el cambio de
-- etapa. Tolerancia de 300m (GPS urbano + imprecisión del pin de dirección).
-- Si todavía no hay ninguna lectura de GPS del conductor, se deja pasar (para
-- no bloquear por un hueco de datos, no por mala fe) -- pero si SÍ hay una
-- lectura y está lejos, se rechaza.
-- =============================================================================

-- ── PARTE 1: reembolso automático al cancelar ────────────────────────────────
CREATE OR REPLACE FUNCTION public.ag_handle_trip_cancellation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status = 'accepted' THEN
    IF COALESCE(NEW.commission_amount, 0) > 0
       AND NEW.driver_id IS NOT NULL
       AND (NEW.driver_stage IS NULL OR NEW.driver_stage IN ('heading_to_pickup', 'arrived_at_pickup'))
       -- Defensa extra contra doble reembolso (la transición accepted->cancelled solo
       -- pasa una vez por diseño, pero esto lo deja a prueba de futuros cambios)
       AND NOT EXISTS (
         SELECT 1 FROM public.ag_wallet_transactions
         WHERE trip_offer_id = NEW.accepted_offer_id AND type = 'refund'
       )
    THEN
      UPDATE public.ag_drivers SET wallet_balance = wallet_balance + NEW.commission_amount WHERE id = NEW.driver_id;

      INSERT INTO public.ag_wallet_transactions (driver_id, amount, type, trip_offer_id, description)
      VALUES (
        NEW.driver_id, NEW.commission_amount, 'refund', NEW.accepted_offer_id,
        'Reembolso comisión — viaje cancelado antes de recoger al pasajero'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_trip_cancellation ON public.ag_trip_requests;
CREATE TRIGGER trg_ag_trip_cancellation
  AFTER UPDATE OF status ON public.ag_trip_requests
  FOR EACH ROW EXECUTE FUNCTION public.ag_handle_trip_cancellation();

-- ── PARTE 2: avance de etapa validado contra el GPS real ─────────────────────
CREATE OR REPLACE FUNCTION public.ag_advance_trip_stage(p_trip_request_id uuid, p_stage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trip        record;
  v_driver_id   uuid;
  v_authorized  boolean;
  v_loc         record;
  v_target_lat  double precision;
  v_target_lng  double precision;
  v_dist_km     double precision;
BEGIN
  IF p_stage NOT IN ('heading_to_pickup','arrived_at_pickup','picked_up','on_route','arrived_at_destination','completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Etapa inválida');
  END IF;

  SELECT * INTO v_trip FROM public.ag_trip_requests
  WHERE id = p_trip_request_id AND status = 'accepted';

  IF v_trip IS NULL OR v_trip.driver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Viaje no encontrado');
  END IF;

  v_driver_id := v_trip.driver_id;

  -- BUG REAL evitado antes de desplegar: la primera versión solo dejaba llamar al CONDUCTOR
  -- de este viaje -- pero "Ya estoy a bordo" también lo dispara el PASAJERO desde su lado
  -- (ver passengerConfirmBoarding en el frontend), lo que hubiera roto ese flujo. Ahora
  -- autoriza a cualquiera de los dos; la validación de GPS siempre se hace contra la
  -- posición real del conductor sin importar quién de los dos confirma.
  SELECT EXISTS(
    SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.id = v_driver_id AND u.auth_user_id = auth.uid()
  ) OR EXISTS(
    SELECT 1 FROM public.ag_users u WHERE u.id = v_trip.passenger_user_id AND u.auth_user_id = auth.uid()
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

  -- Punto contra el que se valida según la etapa que se quiere marcar
  IF p_stage IN ('arrived_at_pickup', 'picked_up', 'on_route') THEN
    v_target_lat := v_trip.origin_lat; v_target_lng := v_trip.origin_lng;
  ELSIF p_stage = 'arrived_at_destination' THEN
    v_target_lat := v_trip.dest_lat; v_target_lng := v_trip.dest_lng;
  END IF;

  IF v_target_lat IS NOT NULL AND v_target_lng IS NOT NULL THEN
    SELECT * INTO v_loc FROM public.ag_driver_locations WHERE driver_id = v_driver_id;
    IF v_loc IS NOT NULL THEN
      v_dist_km := 111.045 * SQRT(
        POWER(v_loc.lat - v_target_lat, 2) +
        POWER((v_loc.lng - v_target_lng) * COS(RADIANS(v_target_lat)), 2)
      );
      IF v_dist_km > 0.3 THEN  -- 300 m de tolerancia
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'No detectamos al conductor cerca del punto esperado (está a ' ||
                    ROUND(v_dist_km::numeric, 1) || ' km). Acérquense y vuelvan a intentar.'
        );
      END IF;
    END IF;
    -- Si v_loc es NULL (todavía no hay ninguna lectura GPS de este conductor), se deja
    -- pasar -- fail-open ante un hueco de datos, no ante evidencia de que no está cerca.
  END IF;

  UPDATE public.ag_trip_requests SET
    driver_stage = p_stage,
    driver_started_at      = CASE WHEN p_stage = 'heading_to_pickup'      THEN now() ELSE driver_started_at END,
    passenger_picked_at    = CASE WHEN p_stage = 'picked_up'              THEN now() ELSE passenger_picked_at END,
    trip_started_at        = CASE WHEN p_stage = 'on_route'               THEN now() ELSE trip_started_at END,
    arrived_at             = CASE WHEN p_stage = 'arrived_at_destination' THEN now() ELSE arrived_at END,
    updated_at = now()
  WHERE id = p_trip_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
