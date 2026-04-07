-- =============================================================================
-- Migration 081: Auto-asignar conductor más cercano en Movi
-- Función que busca conductores online cercanos y crea oferta automática
-- =============================================================================

CREATE OR REPLACE FUNCTION ag_find_nearest_drivers(
  p_trip_request_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_vehicle_type text DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_drivers jsonb := '[]'::jsonb;
  v_rec record;
BEGIN
  -- Buscar conductores online más cercanos usando distancia euclidiana
  -- (suficiente para distancias cortas urbanas)
  FOR v_rec IN
    SELECT
      dl.driver_id,
      d.ag_user_id,
      u.full_name,
      d.vehicle_type,
      d.vehicle_brand,
      d.vehicle_model,
      d.plate,
      dl.lat,
      dl.lng,
      -- Distancia aproximada en km (fórmula Haversine simplificada)
      ROUND(
        (111.045 * SQRT(
          POWER(dl.lat - p_lat, 2) +
          POWER((dl.lng - p_lng) * COS(RADIANS(p_lat)), 2)
        ))::numeric, 2
      ) AS distance_km
    FROM ag_driver_locations dl
    JOIN ag_drivers d ON d.id = dl.driver_id
    JOIN ag_users u ON u.id = d.ag_user_id
    WHERE d.status = 'approved'
      AND d.is_available = true
      AND (p_vehicle_type IS NULL OR d.vehicle_type = p_vehicle_type)
      -- Solo conductores que actualizaron ubicación en los últimos 5 minutos
      AND dl.updated_at > now() - interval '5 minutes'
    ORDER BY
      POWER(dl.lat - p_lat, 2) + POWER((dl.lng - p_lng) * COS(RADIANS(p_lat)), 2)
    LIMIT p_limit
  LOOP
    v_drivers := v_drivers || jsonb_build_object(
      'driver_id', v_rec.driver_id,
      'ag_user_id', v_rec.ag_user_id,
      'full_name', v_rec.full_name,
      'vehicle_type', v_rec.vehicle_type,
      'vehicle_brand', v_rec.vehicle_brand,
      'vehicle_model', v_rec.vehicle_model,
      'plate', v_rec.plate,
      'lat', v_rec.lat,
      'lng', v_rec.lng,
      'distance_km', v_rec.distance_km
    );
  END LOOP;

  RETURN jsonb_build_object(
    'drivers', v_drivers,
    'count', jsonb_array_length(v_drivers)
  );
END;
$$;

-- Función para crear oferta automática del conductor más cercano
CREATE OR REPLACE FUNCTION ag_auto_offer_nearest(
  p_trip_request_id uuid,
  p_driver_id uuid,
  p_offered_price numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_offer_id uuid;
  v_existing uuid;
BEGIN
  -- Verificar que no haya oferta del mismo conductor
  SELECT id INTO v_existing FROM ag_trip_offers
  WHERE trip_request_id = p_trip_request_id AND driver_id = p_driver_id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_offered');
  END IF;

  -- Crear oferta
  INSERT INTO ag_trip_offers (trip_request_id, driver_id, offered_price, status)
  VALUES (p_trip_request_id, p_driver_id, p_offered_price, 'pending')
  RETURNING id INTO v_offer_id;

  RETURN jsonb_build_object('ok', true, 'offer_id', v_offer_id);
END;
$$;
