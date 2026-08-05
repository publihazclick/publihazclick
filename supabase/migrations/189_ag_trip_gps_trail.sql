-- =============================================================================
-- Migration 189: Historial de GPS del PASAJERO (y del conductor, que hoy solo
-- guardaba su última posición, no el recorrido) durante un viaje activo --
-- pedido explícito del usuario 2026-08-04, para poder validar más adelante que
-- conductor y pasajero de verdad viajaron juntos, no solo confiar en botones.
--
-- Decisiones de privacidad, a propósito:
-- - Solo se guarda mientras el viaje está 'accepted' (activo) -- nunca fuera
--   de un viaje real, y nunca continuo/indefinido.
-- - Retención de 30 días (cron de limpieza abajo) -- suficiente para revisar
--   una disputa, no un historial de ubicación indefinido de nadie.
-- - Escritura vía RPC con validación de dueño (no INSERT directo con RLS
--   abierta como ag_driver_locations) -- si esto va a servir para detectar
--   fraude, tiene que ser imposible inyectar puntos falsos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ag_trip_locations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_request_id  uuid NOT NULL REFERENCES public.ag_trip_requests(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('driver','passenger')),
  lat              double precision NOT NULL,
  lng              double precision NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ag_trip_locations_trip_idx ON public.ag_trip_locations(trip_request_id, role, recorded_at);

ALTER TABLE public.ag_trip_locations ENABLE ROW LEVEL SECURITY;

-- Sin política de INSERT/UPDATE/DELETE directa a propósito -- todo pasa por
-- ag_log_trip_location (SECURITY DEFINER), que sí valida quién es quién.
DROP POLICY IF EXISTS "trip_participants_read_locations" ON public.ag_trip_locations;
CREATE POLICY "trip_participants_read_locations" ON public.ag_trip_locations FOR SELECT
  USING (
    trip_request_id IN (
      SELECT id FROM public.ag_trip_requests tr
      WHERE tr.passenger_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid())
         OR tr.driver_id IN (
              SELECT d.id FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
              WHERE u.auth_user_id = auth.uid()
            )
    )
  );

-- ── RPC de escritura: valida que quien llama sea de verdad el conductor o el
--    pasajero de ESE viaje, y que el viaje siga activo, antes de guardar nada ──
CREATE OR REPLACE FUNCTION public.ag_log_trip_location(
  p_trip_request_id uuid, p_role text, p_lat double precision, p_lng double precision
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_trip        record;
  v_authorized  boolean := false;
BEGIN
  IF p_role NOT IN ('driver','passenger') OR p_lat IS NULL OR p_lng IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_trip FROM public.ag_trip_requests
  WHERE id = p_trip_request_id AND status = 'accepted';
  IF v_trip IS NULL THEN
    RETURN; -- viaje no activo -- no hay nada real que registrar
  END IF;

  IF p_role = 'driver' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.ag_drivers d JOIN public.ag_users u ON u.id = d.ag_user_id
      WHERE d.id = v_trip.driver_id AND u.auth_user_id = auth.uid()
    ) INTO v_authorized;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM public.ag_users u WHERE u.id = v_trip.passenger_user_id AND u.auth_user_id = auth.uid()
    ) INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RETURN;
  END IF;

  INSERT INTO public.ag_trip_locations (trip_request_id, role, lat, lng)
  VALUES (p_trip_request_id, p_role, p_lat, p_lng);
END;
$$;

-- ── Correlación GPS: distancia entre conductor y pasajero, emparejando cada
--    punto del conductor con el punto del pasajero más cercano en el tiempo.
--    Sirve para revisión (admin / disputas) y como base para un chequeo
--    automático más adelante, una vez haya datos reales para calibrar un
--    umbral -- todavía no bloquea nada por sí sola. ──────────────────────────
CREATE OR REPLACE FUNCTION public.ag_get_trip_gps_correlation(p_trip_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg_km numeric;
  v_max_km numeric;
  v_pairs  integer;
BEGIN
  WITH driver_pts AS (
    SELECT lat, lng, recorded_at FROM public.ag_trip_locations
    WHERE trip_request_id = p_trip_request_id AND role = 'driver'
  ),
  matched AS (
    SELECT
      111.045 * SQRT(
        POWER(dp.lat - closest.lat, 2) +
        POWER((dp.lng - closest.lng) * COS(RADIANS(dp.lat)), 2)
      ) AS dist_km
    FROM driver_pts dp
    CROSS JOIN LATERAL (
      SELECT pp.lat, pp.lng
      FROM public.ag_trip_locations pp
      WHERE pp.trip_request_id = p_trip_request_id AND pp.role = 'passenger'
      ORDER BY ABS(EXTRACT(EPOCH FROM (pp.recorded_at - dp.recorded_at)))
      LIMIT 1
    ) closest
  )
  SELECT AVG(dist_km), MAX(dist_km), COUNT(*) INTO v_avg_km, v_max_km, v_pairs FROM matched;

  RETURN jsonb_build_object(
    'avg_km', ROUND(COALESCE(v_avg_km, 0)::numeric, 3),
    'max_km', ROUND(COALESCE(v_max_km, 0)::numeric, 3),
    'sample_points', COALESCE(v_pairs, 0)
  );
END;
$$;

-- ── Retención 30 días -- limpieza automática, no historial indefinido ───────
SELECT cron.schedule(
  'cleanup-old-trip-locations',
  '0 8 * * 0', -- domingos 8am UTC, mismo horario que cleanup-stale-push-tokens
  $$ DELETE FROM public.ag_trip_locations WHERE recorded_at < now() - interval '30 days'; $$
);
