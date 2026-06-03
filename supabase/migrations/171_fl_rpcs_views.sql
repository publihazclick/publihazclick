-- ═══════════════════════════════════════════════════════════════
-- 171: MÓDULO FLETES — RPCs, vistas y triggers
-- ═══════════════════════════════════════════════════════════════

-- ── 1. RPC: Publicar solicitud ────────────────────────────────────
CREATE OR REPLACE FUNCTION fl_publish_request(p_data JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
  v_item JSONB;
BEGIN
  -- Crear solicitud
  INSERT INTO fl_requests (
    user_id, service_type, status,
    origin_address, origin_lat, origin_lng, origin_floor, origin_elevator, origin_access_notes,
    dest_address, dest_lat, dest_lng, dest_floor, dest_elevator, dest_access_notes,
    distance_km, estimated_volume_m3, estimated_weight_kg, total_items_count, special_items,
    vehicle_type_required, helpers_needed, needs_disassembly, needs_assembly, fragile_items, passenger_note,
    scheduled_date, scheduled_time_window,
    suggested_price, surge_factor, surge_label,
    insurance_type, insurance_premium, insurance_coverage,
    deposit_amount, photos_items, photos_origin_access, photos_dest_access
  ) VALUES (
    auth.uid(),
    (p_data->>'service_type')::fl_service_type,
    'published',
    p_data->>'origin_address',  (p_data->>'origin_lat')::NUMERIC,  (p_data->>'origin_lng')::NUMERIC,
    COALESCE((p_data->>'origin_floor')::INT, 0),
    COALESCE((p_data->>'origin_elevator')::BOOLEAN, false),
    p_data->>'origin_access_notes',
    p_data->>'dest_address',    (p_data->>'dest_lat')::NUMERIC,    (p_data->>'dest_lng')::NUMERIC,
    COALESCE((p_data->>'dest_floor')::INT, 0),
    COALESCE((p_data->>'dest_elevator')::BOOLEAN, false),
    p_data->>'dest_access_notes',
    COALESCE((p_data->>'distance_km')::NUMERIC, 0),
    COALESCE((p_data->>'estimated_volume_m3')::NUMERIC, 0),
    COALESCE((p_data->>'estimated_weight_kg')::INT, 0),
    COALESCE((p_data->>'total_items_count')::INT, 0),
    COALESCE((SELECT ARRAY_AGG(x) FROM JSONB_ARRAY_ELEMENTS_TEXT(p_data->'special_items') x), '{}'),
    COALESCE((p_data->>'vehicle_type_required')::fl_vehicle_type, 'any'),
    COALESCE((p_data->>'helpers_needed')::INT, 0),
    COALESCE((p_data->>'needs_disassembly')::BOOLEAN, false),
    COALESCE((p_data->>'needs_assembly')::BOOLEAN, false),
    COALESCE((p_data->>'fragile_items')::BOOLEAN, false),
    p_data->>'passenger_note',
    (p_data->>'scheduled_date')::DATE,
    COALESCE(p_data->>'scheduled_time_window', 'flexible'),
    COALESCE((p_data->>'suggested_price')::BIGINT, 0),
    COALESCE((p_data->>'surge_factor')::NUMERIC, 1.0),
    p_data->>'surge_label',
    COALESCE((p_data->>'insurance_type')::fl_insurance_type, 'basic'),
    COALESCE((p_data->>'insurance_premium')::BIGINT, 0),
    COALESCE((p_data->>'insurance_coverage')::BIGINT, 200000),
    COALESCE((p_data->>'deposit_amount')::BIGINT, 0),
    COALESCE((SELECT ARRAY_AGG(x) FROM JSONB_ARRAY_ELEMENTS_TEXT(p_data->'photos_items') x), '{}'),
    COALESCE((SELECT ARRAY_AGG(x) FROM JSONB_ARRAY_ELEMENTS_TEXT(p_data->'photos_origin') x), '{}'),
    COALESCE((SELECT ARRAY_AGG(x) FROM JSONB_ARRAY_ELEMENTS_TEXT(p_data->'photos_dest') x), '{}')
  ) RETURNING id INTO v_id;

  -- Insertar items
  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_data->'items', '[]')) LOOP
    INSERT INTO fl_items (request_id, category, name, quantity, is_fragile, special_type,
                          est_weight_kg, est_volume_m3, photo_url, notes)
    VALUES (
      v_id,
      COALESCE(v_item->>'category', 'otro'),
      COALESCE(v_item->>'name', 'Item'),
      COALESCE((v_item->>'quantity')::INT, 1),
      COALESCE((v_item->>'is_fragile')::BOOLEAN, false),
      v_item->>'special_type',
      COALESCE((v_item->>'est_weight_kg')::NUMERIC, 0),
      COALESCE((v_item->>'est_volume_m3')::NUMERIC, 0),
      v_item->>'photo_url',
      v_item->>'notes'
    );
  END LOOP;

  -- Hito inicial
  INSERT INTO fl_milestones (request_id, milestone_type, completed_at)
  VALUES (v_id, 'published', now());

  RETURN v_id;
END; $$;

-- ── 2. RPC: Enviar oferta ────────────────────────────────────────
CREATE OR REPLACE FUNCTION fl_submit_offer(
  p_request_id     UUID,
  p_price          BIGINT,
  p_helpers        INT,
  p_vehicle_id     UUID,
  p_presentation   TEXT,
  p_availability   TIMESTAMPTZ,
  p_hours          NUMERIC
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
  v_req_status fl_req_status;
BEGIN
  SELECT status INTO v_req_status FROM fl_requests WHERE id = p_request_id;
  IF v_req_status NOT IN ('published','negotiating') THEN
    RAISE EXCEPTION 'Solicitud no disponible para ofertar';
  END IF;

  -- Solo una oferta pendiente por transportista
  IF EXISTS (
    SELECT 1 FROM fl_offers
    WHERE request_id = p_request_id AND transporter_id = auth.uid() AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Ya tienes una oferta activa para esta solicitud';
  END IF;

  INSERT INTO fl_offers (request_id, transporter_id, vehicle_id, offered_price,
                          helpers_included, presentation_text, availability_dt, estimated_hours)
  VALUES (p_request_id, auth.uid(), p_vehicle_id, p_price,
          p_helpers, p_presentation, p_availability, p_hours)
  RETURNING id INTO v_id;

  -- Cambiar status a negotiating
  UPDATE fl_requests SET status = 'negotiating' WHERE id = p_request_id AND status = 'published';

  -- Notificar al solicitante
  INSERT INTO fl_notifications (user_id, request_id, type, message)
  SELECT user_id, p_request_id, 'new_offer',
    '📦 Tienes una nueva oferta de ' || COALESCE(
      (SELECT display_name FROM fl_transporters WHERE user_id = auth.uid()), 'un transportista'
    )
  FROM fl_requests WHERE id = p_request_id;

  RETURN v_id;
END; $$;

-- ── 3. RPC: Aceptar oferta ───────────────────────────────────────
CREATE OR REPLACE FUNCTION fl_accept_offer(p_offer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_offer  fl_offers%ROWTYPE;
  v_req    fl_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM fl_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no encontrada'; END IF;

  SELECT * INTO v_req FROM fl_requests WHERE id = v_offer.request_id;
  IF v_req.user_id <> auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF v_req.status NOT IN ('published','negotiating') THEN
    RAISE EXCEPTION 'Solicitud ya no disponible';
  END IF;

  -- Actualizar oferta aceptada
  UPDATE fl_offers SET status = 'accepted' WHERE id = p_offer_id;

  -- Rechazar el resto
  UPDATE fl_offers SET status = 'rejected'
  WHERE request_id = v_offer.request_id AND id <> p_offer_id AND status = 'pending';

  -- Actualizar solicitud
  UPDATE fl_requests SET
    status = 'accepted',
    transporter_id = v_offer.transporter_id,
    accepted_offer_id = p_offer_id,
    accepted_price = v_offer.offered_price,
    deposit_amount = ROUND(v_offer.offered_price * 0.3 / 1000) * 1000
  WHERE id = v_offer.request_id;

  -- Hito
  INSERT INTO fl_milestones (request_id, milestone_type, completed_at)
  VALUES (v_offer.request_id, 'offer_accepted', now())
  ON CONFLICT (request_id, milestone_type) DO UPDATE SET completed_at = now();

  -- Notificar transportista
  INSERT INTO fl_notifications (user_id, request_id, type, message)
  VALUES (v_offer.transporter_id, v_offer.request_id, 'offer_accepted',
    '🎉 ¡Tu oferta fue aceptada! Prepárate para el servicio.');

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_offer.request_id,
    'transporter_id', v_offer.transporter_id,
    'price', v_offer.offered_price
  );
END; $$;

-- ── 4. RPC: Actualizar hito ──────────────────────────────────────
CREATE OR REPLACE FUNCTION fl_update_milestone(
  p_request_id    UUID,
  p_milestone     fl_milestone_type,
  p_photos        TEXT[] DEFAULT '{}',
  p_notes         TEXT   DEFAULT NULL,
  p_lat           NUMERIC DEFAULT NULL,
  p_lng           NUMERIC DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req fl_requests%ROWTYPE;
  v_new_status fl_req_status;
BEGIN
  SELECT * INTO v_req FROM fl_requests WHERE id = p_request_id;
  IF v_req.user_id <> auth.uid() AND v_req.transporter_id <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO fl_milestones (request_id, milestone_type, completed_at, photos, notes, lat, lng)
  VALUES (p_request_id, p_milestone, now(), p_photos, p_notes, p_lat, p_lng)
  ON CONFLICT (request_id, milestone_type) DO UPDATE SET
    completed_at = now(), photos = p_photos, notes = p_notes, lat = p_lat, lng = p_lng;

  -- Actualizar status solicitud según hito
  v_new_status := CASE p_milestone
    WHEN 'transporter_en_route' THEN 'accepted'
    WHEN 'arrived_origin'       THEN 'in_progress'
    WHEN 'loading_started'      THEN 'in_progress'
    WHEN 'in_transit'           THEN 'in_progress'
    WHEN 'arrived_destination'  THEN 'in_progress'
    WHEN 'unloading_complete'   THEN 'in_progress'
    WHEN 'client_confirmed'     THEN 'completed'
    WHEN 'payment_released'     THEN 'completed'
    ELSE NULL
  END;

  IF v_new_status IS NOT NULL THEN
    UPDATE fl_requests SET status = v_new_status WHERE id = p_request_id;
  END IF;

  -- Fotos before/after
  IF p_milestone = 'loading_started' AND array_length(p_photos, 1) > 0 THEN
    UPDATE fl_requests SET photos_before = p_photos WHERE id = p_request_id;
  END IF;
  IF p_milestone = 'unloading_complete' AND array_length(p_photos, 1) > 0 THEN
    UPDATE fl_requests SET photos_after = p_photos WHERE id = p_request_id;
  END IF;

  RETURN true;
END; $$;

-- ── 5. RPC: Confirmar entrega (solicitante) ──────────────────────
CREATE OR REPLACE FUNCTION fl_confirm_delivery(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req fl_requests%ROWTYPE;
  v_pago BIGINT;
BEGIN
  SELECT * INTO v_req FROM fl_requests WHERE id = p_request_id;
  IF v_req.user_id <> auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  UPDATE fl_requests SET
    status = 'completed',
    requester_confirmed_at = now(),
    completed_at = now(),
    final_payment_paid = true
  WHERE id = p_request_id;

  -- Hito confirmación
  INSERT INTO fl_milestones (request_id, milestone_type, completed_at)
  VALUES (p_request_id, 'client_confirmed', now())
  ON CONFLICT (request_id, milestone_type) DO UPDATE SET completed_at = now();

  -- Calcular pago al transportista (precio - 12% comisión)
  v_pago := ROUND(v_req.accepted_price * 0.88 / 1000) * 1000;

  -- Acreditar wallet transportista
  UPDATE fl_transporters SET
    wallet_balance = wallet_balance + v_pago,
    total_earnings = total_earnings + v_pago,
    total_services = total_services + 1
  WHERE user_id = v_req.transporter_id;

  -- Hito pago liberado
  INSERT INTO fl_milestones (request_id, milestone_type, completed_at)
  VALUES (p_request_id, 'payment_released', now())
  ON CONFLICT (request_id, milestone_type) DO UPDATE SET completed_at = now();

  -- Notificar transportista
  INSERT INTO fl_notifications (user_id, request_id, type, message)
  VALUES (v_req.transporter_id, p_request_id, 'payment_released',
    '💸 ¡Pago liberado! +$' || to_char(v_pago, 'FM999G999G999') || ' COP en tu wallet.');

  RETURN jsonb_build_object('ok', true, 'pago_transportista', v_pago);
END; $$;

-- ── 6. RPC: Calificar ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION fl_submit_rating(p_data JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req fl_requests%ROWTYPE;
  v_avg NUMERIC;
  v_scores INT[];
  v_ratee UUID;
BEGIN
  SELECT * INTO v_req FROM fl_requests WHERE id = (p_data->>'request_id')::UUID;

  v_ratee := CASE WHEN v_req.user_id = auth.uid() THEN v_req.transporter_id ELSE v_req.user_id END;

  -- Calcular promedio según rol
  IF v_req.user_id = auth.uid() THEN
    v_avg := (
      COALESCE((p_data->>'punctuality')::INT, 5) +
      COALESCE((p_data->>'item_care')::INT, 5) +
      COALESCE((p_data->>'professionalism')::INT, 5) +
      COALESCE((p_data->>'communication')::INT, 5) +
      COALESCE((p_data->>'value_for_money')::INT, 5)
    )::NUMERIC / 5;
  ELSE
    v_avg := (
      COALESCE((p_data->>'access_ease')::INT, 5) +
      COALESCE((p_data->>'info_accuracy')::INT, 5) +
      COALESCE((p_data->>'client_behavior')::INT, 5)
    )::NUMERIC / 3;
  END IF;

  INSERT INTO fl_ratings (
    request_id, rater_id, ratee_id, rater_role,
    punctuality, item_care, professionalism, communication, value_for_money,
    access_ease, info_accuracy, client_behavior,
    overall_avg, tags, comment
  ) VALUES (
    (p_data->>'request_id')::UUID, auth.uid(), v_ratee,
    CASE WHEN v_req.user_id = auth.uid() THEN 'requester' ELSE 'transporter' END,
    (p_data->>'punctuality')::INT,     (p_data->>'item_care')::INT,
    (p_data->>'professionalism')::INT, (p_data->>'communication')::INT,
    (p_data->>'value_for_money')::INT, (p_data->>'access_ease')::INT,
    (p_data->>'info_accuracy')::INT,   (p_data->>'client_behavior')::INT,
    v_avg,
    COALESCE((SELECT ARRAY_AGG(x) FROM JSONB_ARRAY_ELEMENTS_TEXT(p_data->'tags') x), '{}'),
    p_data->>'comment'
  ) ON CONFLICT (request_id, rater_id) DO NOTHING;

  -- Actualizar rating promedio del transportista
  UPDATE fl_transporters SET
    rating_avg = (
      SELECT AVG(overall_avg) FROM fl_ratings
      WHERE ratee_id = v_req.transporter_id AND rater_role = 'requester'
    ),
    rating_count = (
      SELECT COUNT(*) FROM fl_ratings
      WHERE ratee_id = v_req.transporter_id AND rater_role = 'requester'
    )
  WHERE user_id = v_req.transporter_id;

  RETURN true;
END; $$;

-- ── 7. RPC: Registrar transportista ─────────────────────────────
CREATE OR REPLACE FUNCTION fl_register_transporter(p_data JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO fl_transporters (user_id, display_name, phone, selfie_url, bio, available_vehicles)
  VALUES (
    auth.uid(),
    p_data->>'display_name',
    p_data->>'phone',
    p_data->>'selfie_url',
    p_data->>'bio',
    COALESCE((SELECT ARRAY_AGG(x) FROM JSONB_ARRAY_ELEMENTS_TEXT(p_data->'available_vehicles') x), '{}')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    phone = EXCLUDED.phone,
    bio = EXCLUDED.bio,
    available_vehicles = EXCLUDED.available_vehicles,
    is_active = true;
  RETURN true;
END; $$;

-- ── 8. RPC: Agregar vehículo ─────────────────────────────────────
CREATE OR REPLACE FUNCTION fl_add_vehicle(p_data JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO fl_vehicles (
    transporter_id, vehicle_type, brand, model, year, plate, color,
    capacity_kg, capacity_m3, max_helpers, photos, is_primary
  ) VALUES (
    auth.uid(),
    (p_data->>'vehicle_type')::fl_vehicle_type,
    p_data->>'brand', p_data->>'model',
    (p_data->>'year')::INT,
    p_data->>'plate', p_data->>'color',
    COALESCE((p_data->>'capacity_kg')::INT, 0),
    COALESCE((p_data->>'capacity_m3')::NUMERIC, 0),
    COALESCE((p_data->>'max_helpers')::INT, 0),
    COALESCE((SELECT ARRAY_AGG(x) FROM JSONB_ARRAY_ELEMENTS_TEXT(p_data->'photos') x), '{}'),
    COALESCE((p_data->>'is_primary')::BOOLEAN, false)
  ) RETURNING id INTO v_id;

  -- Actualizar vehículos disponibles en perfil
  UPDATE fl_transporters SET
    available_vehicles = (
      SELECT ARRAY_AGG(DISTINCT v) FROM (
        SELECT UNNEST(available_vehicles) AS v
        UNION SELECT p_data->>'vehicle_type'
      ) sub
    )
  WHERE user_id = auth.uid();

  RETURN v_id;
END; $$;

-- ── 9. RPC: Solicitudes cercanas para transportista ──────────────
CREATE OR REPLACE FUNCTION fl_nearby_requests(
  p_lat     NUMERIC,
  p_lng     NUMERIC,
  p_radius  NUMERIC DEFAULT 30,
  p_vehicle fl_vehicle_type DEFAULT 'any',
  p_limit   INT DEFAULT 20
) RETURNS TABLE (
  id UUID, service_type fl_service_type, status fl_req_status,
  origin_address TEXT, origin_lat NUMERIC, origin_lng NUMERIC,
  dest_address TEXT, distance_km NUMERIC,
  estimated_volume_m3 NUMERIC, helpers_needed INT,
  vehicle_type_required fl_vehicle_type, fragile_items BOOLEAN,
  suggested_price BIGINT, scheduled_date DATE, scheduled_time_window VARCHAR,
  total_items_count INT, special_items TEXT[], offers_count BIGINT,
  dist_to_origin NUMERIC, created_at TIMESTAMPTZ
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    r.id, r.service_type, r.status,
    r.origin_address, r.origin_lat, r.origin_lng,
    r.dest_address, r.distance_km,
    r.estimated_volume_m3, r.helpers_needed,
    r.vehicle_type_required, r.fragile_items,
    r.suggested_price, r.scheduled_date, r.scheduled_time_window,
    r.total_items_count, r.special_items,
    COUNT(o.id) AS offers_count,
    ROUND(
      6371 * ACOS(
        COS(RADIANS(p_lat)) * COS(RADIANS(r.origin_lat)) *
        COS(RADIANS(r.origin_lng) - RADIANS(p_lng)) +
        SIN(RADIANS(p_lat)) * SIN(RADIANS(r.origin_lat))
      )::NUMERIC, 1
    ) AS dist_to_origin,
    r.created_at
  FROM fl_requests r
  LEFT JOIN fl_offers o ON o.request_id = r.id AND o.status = 'pending'
  WHERE r.status IN ('published','negotiating')
    AND (p_vehicle = 'any' OR r.vehicle_type_required = 'any' OR r.vehicle_type_required = p_vehicle)
    AND 6371 * ACOS(
      COS(RADIANS(p_lat)) * COS(RADIANS(r.origin_lat)) *
      COS(RADIANS(r.origin_lng) - RADIANS(p_lng)) +
      SIN(RADIANS(p_lat)) * SIN(RADIANS(r.origin_lat))
    ) <= p_radius
    AND r.scheduled_date >= CURRENT_DATE
  GROUP BY r.id
  ORDER BY dist_to_origin ASC, r.created_at DESC
  LIMIT p_limit;
$$;

-- ── 10. Vista: Detalle solicitud completo ───────────────────────
CREATE OR REPLACE VIEW fl_request_detail_v AS
SELECT
  r.*,
  t.display_name      AS trans_name,
  t.selfie_url        AS trans_photo,
  t.rating_avg        AS trans_rating,
  t.total_services    AS trans_services,
  t.phone             AS trans_phone,
  (SELECT jsonb_agg(jsonb_build_object(
    'id', i.id, 'name', i.name, 'category', i.category,
    'quantity', i.quantity, 'is_fragile', i.is_fragile,
    'special_type', i.special_type, 'photo_url', i.photo_url,
    'est_volume_m3', i.est_volume_m3, 'est_weight_kg', i.est_weight_kg
  )) FROM fl_items i WHERE i.request_id = r.id) AS items_json,
  (SELECT jsonb_agg(jsonb_build_object(
    'type', m.milestone_type, 'completed_at', m.completed_at,
    'photos', m.photos, 'notes', m.notes
  ) ORDER BY m.created_at) FROM fl_milestones m WHERE m.request_id = r.id) AS milestones_json
FROM fl_requests r
LEFT JOIN fl_transporters t ON t.user_id = r.transporter_id;

-- ── 11. Vista: Ofertas con perfil de transportista ───────────────
CREATE OR REPLACE VIEW fl_offers_v AS
SELECT
  o.*,
  t.display_name  AS trans_name,
  t.selfie_url    AS trans_photo,
  t.rating_avg    AS trans_rating,
  t.total_services AS trans_services,
  t.phone         AS trans_phone,
  v.brand         AS vehicle_brand,
  v.model         AS vehicle_model,
  v.vehicle_type  AS vehicle_type_info,
  v.capacity_m3   AS vehicle_capacity_m3,
  v.photos        AS vehicle_photos
FROM fl_offers o
JOIN fl_transporters t ON t.user_id = o.transporter_id
LEFT JOIN fl_vehicles v ON v.id = o.vehicle_id;
