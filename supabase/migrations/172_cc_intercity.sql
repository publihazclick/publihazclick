-- ═══════════════════════════════════════════════════════════════
-- 172: MÓDULO CIUDAD A CIUDAD — Schema completo
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Tipos ENUM ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE cc_vehicle_cat  AS ENUM ('eco','ejecutivo','premium','familiar','mascotas');
  CREATE TYPE cc_req_status   AS ENUM ('searching','negotiating','accepted','in_progress','completed','cancelled');
  CREATE TYPE cc_offer_status AS ENUM ('pending','accepted','rejected','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Solicitudes de viaje intercity ────────────────────────────
CREATE TABLE IF NOT EXISTS cc_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Ruta
  origin_city       TEXT NOT NULL,
  origin_lat        NUMERIC(10,6) NOT NULL DEFAULT 0,
  origin_lng        NUMERIC(10,6) NOT NULL DEFAULT 0,
  dest_city         TEXT NOT NULL,
  dest_lat          NUMERIC(10,6) NOT NULL DEFAULT 0,
  dest_lng          NUMERIC(10,6) NOT NULL DEFAULT 0,
  distance_km       NUMERIC(8,2)  NOT NULL DEFAULT 0,

  -- Configuración
  vehicle_cat       cc_vehicle_cat NOT NULL DEFAULT 'eco',
  passengers        INT NOT NULL DEFAULT 1,
  luggage_large     INT NOT NULL DEFAULT 0,
  baby_seats        INT NOT NULL DEFAULT 0,
  round_trip        BOOLEAN NOT NULL DEFAULT false,
  return_datetime   TIMESTAMPTZ,
  passenger_note    TEXT,

  -- Horario
  scheduled_dt      TIMESTAMPTZ NOT NULL,

  -- Precios
  suggested_price   BIGINT NOT NULL DEFAULT 0,
  accepted_price    BIGINT,

  -- Estado
  status            cc_req_status NOT NULL DEFAULT 'searching',
  driver_id         UUID REFERENCES auth.users(id),
  accepted_offer_id UUID,

  -- Seguridad
  verification_code CHAR(4),
  code_verified     BOOLEAN NOT NULL DEFAULT false,

  -- Cancelación / completado
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  cancelled_by      VARCHAR(20),
  completed_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_requests_user_idx    ON cc_requests(user_id);
CREATE INDEX IF NOT EXISTS cc_requests_status_idx  ON cc_requests(status);
CREATE INDEX IF NOT EXISTS cc_requests_driver_idx  ON cc_requests(driver_id);
CREATE INDEX IF NOT EXISTS cc_requests_sched_idx   ON cc_requests(scheduled_dt);

-- ── 3. Paradas intermedias ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_stops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES cc_requests(id) ON DELETE CASCADE,
  stop_order      INT NOT NULL DEFAULT 1,
  address         TEXT NOT NULL,
  lat             NUMERIC(10,6) NOT NULL DEFAULT 0,
  lng             NUMERIC(10,6) NOT NULL DEFAULT 0,
  wait_min        INT NOT NULL DEFAULT 10,
  extra_price     BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_stops_request_idx ON cc_stops(request_id);

-- ── 4. Ofertas de conductores ────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES cc_requests(id) ON DELETE CASCADE,
  driver_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          cc_offer_status NOT NULL DEFAULT 'pending',
  offered_price   BIGINT NOT NULL,
  vehicle_desc    TEXT,
  plate           VARCHAR(10),
  message         TEXT,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_offers_request_idx ON cc_offers(request_id);
CREATE INDEX IF NOT EXISTS cc_offers_driver_idx  ON cc_offers(driver_id);
CREATE UNIQUE INDEX IF NOT EXISTS cc_offers_unique_pending ON cc_offers(request_id, driver_id)
  WHERE status = 'pending';

-- ── 5. Calificaciones ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES cc_requests(id) ON DELETE CASCADE,
  rater_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars       INT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tags        TEXT[] NOT NULL DEFAULT '{}',
  comment     TEXT,
  tip_amount  BIGINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, rater_id)
);

-- ── 6. Trigger updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION cc_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER cc_requests_upd
  BEFORE UPDATE ON cc_requests
  FOR EACH ROW EXECUTE FUNCTION cc_set_updated_at();

-- ── 7. RLS ──────────────────────────────────────────────────────
ALTER TABLE cc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_stops    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_offers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_ratings  ENABLE ROW LEVEL SECURITY;

-- cc_requests
CREATE POLICY cc_req_read ON cc_requests FOR SELECT USING (
  user_id = auth.uid() OR driver_id = auth.uid()
  OR status IN ('searching','negotiating')
);
CREATE POLICY cc_req_ins ON cc_requests FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY cc_req_upd ON cc_requests FOR UPDATE USING (
  user_id = auth.uid() OR driver_id = auth.uid()
);

-- cc_stops
CREATE POLICY cc_stops_read ON cc_stops FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM cc_requests r WHERE r.id = request_id
    AND (r.user_id = auth.uid() OR r.driver_id = auth.uid()
         OR r.status IN ('searching','negotiating'))
  )
);
CREATE POLICY cc_stops_ins ON cc_stops FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM cc_requests r WHERE r.id = request_id AND r.user_id = auth.uid())
);

-- cc_offers
CREATE POLICY cc_offer_read ON cc_offers FOR SELECT USING (
  driver_id = auth.uid()
  OR EXISTS (SELECT 1 FROM cc_requests r WHERE r.id = request_id AND r.user_id = auth.uid())
);
CREATE POLICY cc_offer_ins ON cc_offers FOR INSERT WITH CHECK (driver_id = auth.uid());
CREATE POLICY cc_offer_upd ON cc_offers FOR UPDATE USING (
  driver_id = auth.uid()
  OR EXISTS (SELECT 1 FROM cc_requests r WHERE r.id = request_id AND r.user_id = auth.uid())
);

-- cc_ratings
CREATE POLICY cc_rating_read ON cc_ratings FOR SELECT USING (true);
CREATE POLICY cc_rating_ins  ON cc_ratings FOR INSERT WITH CHECK (rater_id = auth.uid());

-- ── 8. RPCs ──────────────────────────────────────────────────────

-- Crear solicitud intercity
CREATE OR REPLACE FUNCTION cc_create_request(p_data JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID; v_code CHAR(4); v_stop JSONB; v_i INT := 1;
BEGIN
  v_code := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

  INSERT INTO cc_requests (
    user_id, origin_city, origin_lat, origin_lng,
    dest_city, dest_lat, dest_lng, distance_km,
    vehicle_cat, passengers, luggage_large, baby_seats,
    round_trip, return_datetime, passenger_note,
    scheduled_dt, suggested_price, status, verification_code
  ) VALUES (
    auth.uid(),
    p_data->>'origin_city',
    COALESCE((p_data->>'origin_lat')::NUMERIC, 0),
    COALESCE((p_data->>'origin_lng')::NUMERIC, 0),
    p_data->>'dest_city',
    COALESCE((p_data->>'dest_lat')::NUMERIC, 0),
    COALESCE((p_data->>'dest_lng')::NUMERIC, 0),
    COALESCE((p_data->>'distance_km')::NUMERIC, 0),
    COALESCE((p_data->>'vehicle_cat'), 'eco')::cc_vehicle_cat,
    COALESCE((p_data->>'passengers')::INT, 1),
    COALESCE((p_data->>'luggage_large')::INT, 0),
    COALESCE((p_data->>'baby_seats')::INT, 0),
    COALESCE((p_data->>'round_trip')::BOOLEAN, false),
    (p_data->>'return_datetime')::TIMESTAMPTZ,
    p_data->>'passenger_note',
    (p_data->>'scheduled_dt')::TIMESTAMPTZ,
    COALESCE((p_data->>'suggested_price')::BIGINT, 0),
    'searching',
    v_code
  ) RETURNING id INTO v_id;

  FOR v_stop IN SELECT * FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_data->'stops', '[]')) LOOP
    INSERT INTO cc_stops (request_id, stop_order, address, lat, lng, wait_min)
    VALUES (v_id, v_i, v_stop->>'address',
            COALESCE((v_stop->>'lat')::NUMERIC, 0),
            COALESCE((v_stop->>'lng')::NUMERIC, 0),
            COALESCE((v_stop->>'wait_min')::INT, 10));
    v_i := v_i + 1;
  END LOOP;

  RETURN v_id;
END; $$;

-- Enviar oferta (conductor)
CREATE OR REPLACE FUNCTION cc_submit_offer(
  p_request_id UUID, p_price BIGINT,
  p_vehicle_desc TEXT, p_plate TEXT, p_message TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cc_requests WHERE id = p_request_id AND status IN ('searching','negotiating')
  ) THEN RAISE EXCEPTION 'Solicitud no disponible'; END IF;

  INSERT INTO cc_offers (request_id, driver_id, offered_price, vehicle_desc, plate, message)
  VALUES (p_request_id, auth.uid(), p_price, p_vehicle_desc, p_plate, p_message)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  UPDATE cc_requests SET status = 'negotiating' WHERE id = p_request_id AND status = 'searching';
  RETURN v_id;
END; $$;

-- Aceptar oferta (pasajero)
CREATE OR REPLACE FUNCTION cc_accept_offer(p_offer_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_offer cc_offers%ROWTYPE; v_req cc_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_offer FROM cc_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no encontrada'; END IF;
  SELECT * INTO v_req FROM cc_requests WHERE id = v_offer.request_id;
  IF v_req.user_id <> auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  UPDATE cc_offers SET status = 'accepted' WHERE id = p_offer_id;
  UPDATE cc_offers SET status = 'rejected'
  WHERE request_id = v_offer.request_id AND id <> p_offer_id AND status = 'pending';

  UPDATE cc_requests SET
    status = 'accepted',
    driver_id = v_offer.driver_id,
    accepted_price = v_offer.offered_price,
    accepted_offer_id = p_offer_id
  WHERE id = v_offer.request_id;

  RETURN jsonb_build_object('ok', true, 'driver_id', v_offer.driver_id, 'price', v_offer.offered_price);
END; $$;

-- Verificar código de abordaje
CREATE OR REPLACE FUNCTION cc_verify_code(p_request_id UUID, p_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_req cc_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM cc_requests WHERE id = p_request_id;
  IF v_req.verification_code = p_code THEN
    UPDATE cc_requests SET code_verified = true WHERE id = p_request_id;
    RETURN true;
  END IF;
  RETURN false;
END; $$;

-- Iniciar viaje (conductor)
CREATE OR REPLACE FUNCTION cc_start_trip(p_request_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE cc_requests SET status = 'in_progress'
  WHERE id = p_request_id AND driver_id = auth.uid() AND status = 'accepted' AND code_verified = true;
  RETURN FOUND;
END; $$;

-- Completar viaje
CREATE OR REPLACE FUNCTION cc_complete_trip(p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_req cc_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM cc_requests WHERE id = p_request_id;
  IF v_req.user_id <> auth.uid() AND v_req.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  UPDATE cc_requests SET status = 'completed', completed_at = now() WHERE id = p_request_id;
  RETURN jsonb_build_object('ok', true, 'price', v_req.accepted_price);
END; $$;

-- Cancelar viaje
CREATE OR REPLACE FUNCTION cc_cancel_request(p_request_id UUID, p_reason TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_req cc_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM cc_requests WHERE id = p_request_id;
  IF v_req.user_id <> auth.uid() AND v_req.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  UPDATE cc_requests SET
    status = 'cancelled',
    cancelled_at = now(),
    cancel_reason = p_reason,
    cancelled_by = CASE WHEN v_req.user_id = auth.uid() THEN 'passenger' ELSE 'driver' END
  WHERE id = p_request_id AND status NOT IN ('completed','cancelled');
  RETURN FOUND;
END; $$;

-- Calificar viaje
CREATE OR REPLACE FUNCTION cc_submit_rating(
  p_request_id UUID, p_stars INT, p_tags TEXT[], p_comment TEXT, p_tip BIGINT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_req cc_requests%ROWTYPE; v_ratee UUID;
BEGIN
  SELECT * INTO v_req FROM cc_requests WHERE id = p_request_id;
  v_ratee := CASE WHEN v_req.user_id = auth.uid() THEN v_req.driver_id ELSE v_req.user_id END;
  INSERT INTO cc_ratings (request_id, rater_id, ratee_id, stars, tags, comment, tip_amount)
  VALUES (p_request_id, auth.uid(), v_ratee, p_stars, COALESCE(p_tags,'{}'), p_comment, COALESCE(p_tip,0))
  ON CONFLICT (request_id, rater_id) DO NOTHING;
  RETURN true;
END; $$;

-- Solicitudes disponibles para conductores
CREATE OR REPLACE FUNCTION cc_driver_requests(p_origin TEXT DEFAULT NULL, p_limit INT DEFAULT 30)
RETURNS TABLE (
  id UUID, origin_city TEXT, dest_city TEXT, scheduled_dt TIMESTAMPTZ,
  vehicle_cat cc_vehicle_cat, passengers INT, luggage_large INT, baby_seats INT,
  round_trip BOOLEAN, suggested_price BIGINT, status cc_req_status,
  offers_count BIGINT, distance_km NUMERIC, created_at TIMESTAMPTZ
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT r.id, r.origin_city, r.dest_city, r.scheduled_dt,
    r.vehicle_cat, r.passengers, r.luggage_large, r.baby_seats,
    r.round_trip, r.suggested_price, r.status,
    COUNT(o.id) AS offers_count,
    r.distance_km, r.created_at
  FROM cc_requests r
  LEFT JOIN cc_offers o ON o.request_id = r.id AND o.status = 'pending'
  WHERE r.status IN ('searching','negotiating')
    AND r.scheduled_dt >= now()
    AND (p_origin IS NULL OR r.origin_city ILIKE '%' || p_origin || '%')
    AND NOT EXISTS (
      SELECT 1 FROM cc_offers x WHERE x.request_id = r.id AND x.driver_id = auth.uid()
    )
  GROUP BY r.id
  ORDER BY r.scheduled_dt ASC, r.created_at DESC
  LIMIT p_limit;
$$;

-- ── 9. Vista con info del conductor ─────────────────────────────
CREATE OR REPLACE VIEW cc_request_detail_v AS
SELECT
  r.*,
  au.raw_user_meta_data->>'full_name'                              AS driver_name,
  (SELECT selfie_url FROM ag_users WHERE auth_user_id = r.driver_id)   AS driver_photo,
  (SELECT phone      FROM ag_users WHERE auth_user_id = r.driver_id)   AS driver_phone,
  (SELECT AVG(stars)::NUMERIC(3,2) FROM ag_ratings WHERE driver_id = r.driver_id) AS driver_rating,
  (SELECT COUNT(*) FROM ag_trips WHERE driver_id = r.driver_id AND status = 'completed') AS driver_trips,
  (SELECT jsonb_agg(jsonb_build_object(
      'order', s.stop_order, 'address', s.address, 'wait_min', s.wait_min
    ) ORDER BY s.stop_order)
   FROM cc_stops s WHERE s.request_id = r.id) AS stops_json
FROM cc_requests r
LEFT JOIN auth.users au ON au.id = r.driver_id;

-- ── 10. Vista de ofertas con perfil del conductor ────────────────
CREATE OR REPLACE VIEW cc_offers_v AS
SELECT
  o.*,
  au.raw_user_meta_data->>'full_name'                              AS driver_name,
  (SELECT selfie_url FROM ag_users WHERE auth_user_id = o.driver_id)   AS driver_photo,
  (SELECT AVG(stars)::NUMERIC(3,2) FROM ag_ratings WHERE driver_id = o.driver_id) AS driver_rating,
  (SELECT COUNT(*) FROM ag_trips WHERE driver_id = o.driver_id AND status = 'completed') AS driver_trips
FROM cc_offers o
LEFT JOIN auth.users au ON au.id = o.driver_id;
