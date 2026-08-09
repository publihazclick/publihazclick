-- =============================================================================
-- Migration 200: fix real -- ag_advance_trip_stage (migración 188) intentaba
-- escribir en columnas trip_started_at y arrived_at que NUNCA existieron en
-- ag_trip_requests de este proyecto (hndhgtnjyjwrnzdcgcca) -- probablemente
-- copiadas de otro contexto sin verificar contra el schema real. Esto rompía
-- el UPDATE para CUALQUIER etapa (incluida la primera, "Ir a recoger
-- pasajero" / heading_to_pickup) con el error:
--   column "trip_started_at" does not exist
-- Se quitan esas dos columnas del UPDATE -- no se leen en ningún lado del
-- frontend ni de otras funciones (ag_trip_requests ya guarda el mismo
-- instante con más granularidad vía driver_started_at, passenger_picked_at y
-- completed_at). Nada más cambia.
-- =============================================================================

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

  SELECT EXISTS(
    SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.id = v_driver_id AND u.auth_user_id = auth.uid()
  ) OR EXISTS(
    SELECT 1 FROM public.ag_users u WHERE u.id = v_trip.passenger_user_id AND u.auth_user_id = auth.uid()
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
  END IF;

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
      IF v_dist_km > 0.3 THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'No detectamos al conductor cerca del punto esperado (está a ' ||
                    ROUND(v_dist_km::numeric, 1) || ' km). Acérquense y vuelvan a intentar.'
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.ag_trip_requests SET
    driver_stage = p_stage,
    driver_started_at   = CASE WHEN p_stage = 'heading_to_pickup' THEN now() ELSE driver_started_at   END,
    passenger_picked_at = CASE WHEN p_stage = 'picked_up'         THEN now() ELSE passenger_picked_at END,
    updated_at = now()
  WHERE id = p_trip_request_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
