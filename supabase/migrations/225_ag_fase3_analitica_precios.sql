-- Fase 3 del plan hacia unicornio (ver memoria movi_unicorn_code_plan_2026-08-14):
-- 1) Precio dinámico real basado en oferta/demanda en vivo (además del horario fijo
--    que ya existía, sin tocarlo -- se combina, nunca se reemplaza).
-- 2) Métricas de negocio reales para el panel admin.
-- 3) Detección de patrones sospechosos (fraude), solo para que el admin los revise,
--    nunca castiga a nadie automáticamente.
--
-- Todo aditivo: ninguna función ni tabla existente se modifica ni se borra.

-- ─── 1) Precio dinámico real ──────────────────────────────────────────────────

-- Multiplicador según oferta/demanda REAL en los últimos 10 minutos, en un radio
-- alrededor del punto (por defecto 5km). Si no hay demanda activa cerca, es 1.00
-- (nunca sube el precio sin una razón real).
CREATE OR REPLACE FUNCTION public.ag_live_surge_multiplier(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 5
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  v_drivers integer;
  v_demand  integer;
  v_ratio   numeric;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RETURN 1.00;
  END IF;

  SELECT count(DISTINCT dl.driver_id) INTO v_drivers
  FROM public.ag_driver_locations dl
  JOIN public.ag_drivers d ON d.id = dl.driver_id
  WHERE d.status = 'approved' AND d.is_online = true AND d.is_available = true
    AND dl.updated_at > now() - interval '10 minutes'
    AND ST_DWithin(dl.geog, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000);

  SELECT count(*) INTO v_demand
  FROM public.ag_trip_requests
  WHERE status = 'searching'
    AND created_at > now() - interval '10 minutes'
    AND origin_lat IS NOT NULL AND origin_lng IS NOT NULL
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(origin_lng, origin_lat), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
      p_radius_km * 1000
    );

  IF v_demand = 0 THEN
    RETURN 1.00;
  END IF;

  v_ratio := v_demand::numeric / GREATEST(v_drivers, 1);

  RETURN CASE
    WHEN v_ratio <= 0.5 THEN 1.00
    WHEN v_ratio <= 1.0 THEN 1.15
    WHEN v_ratio <= 2.0 THEN 1.30
    WHEN v_ratio <= 4.0 THEN 1.50
    ELSE 1.80
  END;
END;
$function$;

-- Combina el multiplicador de horario fijo (ag_current_surge, YA EXISTENTE, sin
-- tocar) con el multiplicador en vivo de arriba -- se usa el más alto de los dos,
-- mismo criterio que ya usa ag_current_surge para combinar varias reglas activas.
CREATE OR REPLACE FUNCTION public.ag_blended_surge(
  p_lat double precision,
  p_lng double precision,
  p_zone_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $function$
  SELECT GREATEST(
    public.ag_current_surge(p_zone_id),
    public.ag_live_surge_multiplier(p_lat, p_lng)
  );
$function$;

-- ─── 2) Métricas de negocio reales ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ag_business_metrics(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $function$
DECLARE
  v_since timestamptz := now() - (p_days || ' days')::interval;
  v_total integer;
  v_completed integer;
  v_cancelled integer;
  v_completion_rate numeric;
  v_avg_wait_min numeric;
  v_avg_trip_min numeric;
  v_avg_price numeric;
  v_total_passengers integer;
  v_repeat_passengers integer;
  v_retention_rate numeric;
BEGIN
  SELECT count(*) INTO v_total FROM public.ag_trip_requests WHERE created_at >= v_since;
  SELECT count(*) INTO v_completed FROM public.ag_trip_requests WHERE created_at >= v_since AND status = 'completed';
  SELECT count(*) INTO v_cancelled FROM public.ag_trip_requests WHERE created_at >= v_since AND status = 'cancelled';
  v_completion_rate := CASE WHEN v_total > 0 THEN round(v_completed::numeric / v_total * 100, 1) ELSE 0 END;

  -- Tiempo de espera real: desde que se creó la solicitud hasta que se aceptó
  -- la oferta ganadora (ag_trip_offers.updated_at cuando su status pasa a
  -- 'accepted' -- no hay columna accepted_at dedicada, este es el proxy real).
  -- Se descartan valores fuera de 0-180 min (3h) -- encontrado en la primera
  -- revisión de esta misma función: datos de prueba viejos con timestamps
  -- irreales (viajes "aceptados" días después de creados) disparaban el
  -- promedio a números sin sentido. Un viaje real nunca espera 3 horas.
  SELECT round(avg(extract(epoch FROM (o.updated_at - t.created_at)) / 60)::numeric, 1) INTO v_avg_wait_min
  FROM public.ag_trip_requests t
  JOIN public.ag_trip_offers o ON o.id = t.accepted_offer_id
  WHERE t.created_at >= v_since AND o.status = 'accepted'
    AND o.updated_at >= t.created_at
    AND extract(epoch FROM (o.updated_at - t.created_at)) / 60 <= 180;

  -- Mismo criterio: se descartan duraciones fuera de 0-360 min (6h, cubre con
  -- margen hasta viajes largos de ciudad a ciudad) para no dejar que un dato
  -- viejo/corrupto dispare el promedio.
  SELECT round(avg(extract(epoch FROM (t.completed_at - t.driver_started_at)) / 60)::numeric, 1) INTO v_avg_trip_min
  FROM public.ag_trip_requests t
  WHERE t.created_at >= v_since AND t.status = 'completed' AND t.driver_started_at IS NOT NULL AND t.completed_at IS NOT NULL
    AND t.completed_at >= t.driver_started_at
    AND extract(epoch FROM (t.completed_at - t.driver_started_at)) / 60 <= 360;

  SELECT round(avg(final_price)::numeric, 0) INTO v_avg_price
  FROM public.ag_trip_requests WHERE created_at >= v_since AND status = 'completed' AND final_price IS NOT NULL;

  SELECT count(DISTINCT passenger_user_id) INTO v_total_passengers
  FROM public.ag_trip_requests WHERE created_at >= v_since AND passenger_user_id IS NOT NULL;

  SELECT count(*) INTO v_repeat_passengers FROM (
    SELECT passenger_user_id FROM public.ag_trip_requests
    WHERE created_at >= v_since AND passenger_user_id IS NOT NULL AND status = 'completed'
    GROUP BY passenger_user_id HAVING count(*) > 1
  ) sub;

  v_retention_rate := CASE WHEN v_total_passengers > 0 THEN round(v_repeat_passengers::numeric / v_total_passengers * 100, 1) ELSE 0 END;

  RETURN jsonb_build_object(
    'period_days', p_days,
    'total_requests', v_total,
    'completed_requests', v_completed,
    'cancelled_requests', v_cancelled,
    'completion_rate_pct', v_completion_rate,
    'avg_wait_minutes', COALESCE(v_avg_wait_min, 0),
    'avg_trip_minutes', COALESCE(v_avg_trip_min, 0),
    'avg_price_cop', COALESCE(v_avg_price, 0),
    'total_passengers', v_total_passengers,
    'repeat_passengers', v_repeat_passengers,
    'retention_rate_pct', v_retention_rate
  );
END;
$function$;

-- ─── 3) Detección de patrones sospechosos (solo alerta, nunca castiga solo) ──

-- Mismo par conductor-pasajero repitiéndose de forma anormal (posible acuerdo
-- para farmear bonos entre dos cuentas que se conocen).
CREATE OR REPLACE FUNCTION public.ag_fraud_repeated_pairs(
  p_min_trips integer DEFAULT 5,
  p_min_share numeric DEFAULT 0.6
)
RETURNS TABLE(
  driver_id uuid, driver_name text,
  passenger_user_id uuid, passenger_name text,
  pair_trips integer, driver_total_trips integer, share numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  WITH pairs AS (
    SELECT t.driver_id, t.passenger_user_id, count(*)::integer AS pair_trips
    FROM public.ag_trip_requests t
    WHERE t.status = 'completed' AND t.driver_id IS NOT NULL AND t.passenger_user_id IS NOT NULL
    GROUP BY t.driver_id, t.passenger_user_id
  ),
  driver_totals AS (
    SELECT driver_id, count(*)::integer AS total_trips
    FROM public.ag_trip_requests
    WHERE status = 'completed' AND driver_id IS NOT NULL
    GROUP BY driver_id
  )
  SELECT p.driver_id, du.full_name, p.passenger_user_id, pu.full_name,
         p.pair_trips, dt.total_trips,
         round(p.pair_trips::numeric / dt.total_trips, 2) AS share
  FROM pairs p
  JOIN driver_totals dt ON dt.driver_id = p.driver_id
  LEFT JOIN public.ag_drivers d ON d.id = p.driver_id
  LEFT JOIN public.ag_users du ON du.id = d.ag_user_id
  LEFT JOIN public.ag_users pu ON pu.id = p.passenger_user_id
  WHERE p.pair_trips >= p_min_trips
    AND p.pair_trips::numeric / dt.total_trips >= p_min_share
  ORDER BY share DESC, pair_trips DESC;
$function$;

-- Viajes muy cortos repetidos por el mismo conductor (posible farmeo de bonos
-- por cantidad de viajes en vez de trabajo real).
CREATE OR REPLACE FUNCTION public.ag_fraud_short_trip_farming(
  p_max_km numeric DEFAULT 0.4,
  p_min_trips integer DEFAULT 5,
  p_days integer DEFAULT 7
)
RETURNS TABLE(driver_id uuid, driver_name text, short_trips integer, avg_distance_km numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT t.driver_id, u.full_name, count(*)::integer AS short_trips, round(avg(t.distance_km)::numeric, 2)
  FROM public.ag_trip_requests t
  LEFT JOIN public.ag_drivers d ON d.id = t.driver_id
  LEFT JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE t.status = 'completed'
    AND t.distance_km IS NOT NULL AND t.distance_km <= p_max_km
    AND t.created_at >= now() - (p_days || ' days')::interval
    AND t.driver_id IS NOT NULL
  GROUP BY t.driver_id, u.full_name
  HAVING count(*) >= p_min_trips
  ORDER BY short_trips DESC;
$function$;

-- Viajes ya marcados por el chequeo de integridad GPS que YA EXISTÍA
-- (ag_check_trip_gps_integrity, corre solo al completar cada viaje) -- esto
-- solo los agrupa/expone para que el admin los vea en un solo lugar.
CREATE OR REPLACE FUNCTION public.ag_fraud_gps_flagged(p_days integer DEFAULT 7)
RETURNS TABLE(trip_id uuid, driver_id uuid, driver_name text, completed_at timestamptz, detail jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT t.id, t.driver_id, u.full_name, t.completed_at, t.gps_integrity_detail
  FROM public.ag_trip_requests t
  LEFT JOIN public.ag_drivers d ON d.id = t.driver_id
  LEFT JOIN public.ag_users u ON u.id = d.ag_user_id
  WHERE t.gps_integrity_flagged = true
    AND t.completed_at >= now() - (p_days || ' days')::interval
  ORDER BY t.completed_at DESC;
$function$;
