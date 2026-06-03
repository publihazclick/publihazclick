-- ═══════════════════════════════════════════════════════════════
-- 174: Ciudad a Ciudad — Favoritos, límite cancelaciones, geocerca
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Conductores favoritos ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, driver_id)
);

CREATE INDEX IF NOT EXISTS cc_favorites_user_idx ON cc_favorites(user_id);

ALTER TABLE cc_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_fav_own ON cc_favorites FOR ALL USING (user_id = auth.uid());

-- ── 2. Columnas adicionales en cc_requests ───────────────────────
ALTER TABLE cc_requests ADD COLUMN IF NOT EXISTS is_price_dynamic   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cc_requests ADD COLUMN IF NOT EXISTS round_trip_same_driver BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE cc_requests ADD COLUMN IF NOT EXISTS co2_kg             NUMERIC(8,2) NOT NULL DEFAULT 0;

-- ── 3. RPC: Toggle favorito ──────────────────────────────────────
CREATE OR REPLACE FUNCTION cc_toggle_favorite(p_driver_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM cc_favorites WHERE user_id = auth.uid() AND driver_id = p_driver_id
  ) INTO v_exists;
  IF v_exists THEN
    DELETE FROM cc_favorites WHERE user_id = auth.uid() AND driver_id = p_driver_id;
    RETURN false;
  ELSE
    INSERT INTO cc_favorites (user_id, driver_id) VALUES (auth.uid(), p_driver_id)
    ON CONFLICT DO NOTHING;
    RETURN true;
  END IF;
END; $$;

-- ── 4. RPC: Verificar límite cancelaciones del mes ───────────────
CREATE OR REPLACE FUNCTION cc_cancels_this_month()
RETURNS INT LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COUNT(*)::INT FROM cc_requests
  WHERE user_id = auth.uid()
    AND cancelled_by = 'passenger'
    AND cancelled_at >= date_trunc('month', now());
$$;

-- ── 5. RPC: Verificar geocerca (distancia al origen) ─────────────
CREATE OR REPLACE FUNCTION cc_verify_geocerca(
  p_request_id UUID, p_lat NUMERIC, p_lng NUMERIC
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_req cc_requests%ROWTYPE; v_dist NUMERIC;
BEGIN
  SELECT * INTO v_req FROM cc_requests WHERE id = p_request_id;
  v_dist := 6371 * ACOS(
    COS(RADIANS(p_lat)) * COS(RADIANS(v_req.origin_lat)) *
    COS(RADIANS(v_req.origin_lng) - RADIANS(p_lng)) +
    SIN(RADIANS(p_lat)) * SIN(RADIANS(v_req.origin_lat))
  );
  RETURN v_dist <= 5; -- dentro de 5 km del origen
END; $$;

-- ── 6. Vista favoritos con info del conductor ────────────────────
CREATE OR REPLACE VIEW cc_favorites_v AS
SELECT
  f.*,
  au.raw_user_meta_data->>'full_name'                               AS driver_name,
  (SELECT selfie_url FROM ag_users WHERE auth_user_id = f.driver_id LIMIT 1) AS driver_photo,
  (SELECT AVG(stars)::NUMERIC(3,2) FROM cc_ratings WHERE ratee_id = f.driver_id) AS driver_rating,
  (SELECT COUNT(*) FROM cc_requests WHERE driver_id = f.driver_id AND status = 'completed') AS driver_trips
FROM cc_favorites f
LEFT JOIN auth.users au ON au.id = f.driver_id;
