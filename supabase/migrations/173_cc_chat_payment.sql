-- ═══════════════════════════════════════════════════════════════
-- 173: Ciudad a Ciudad — Chat, método de pago, paradas en vivo
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Agregar método de pago a cc_requests ──────────────────────
ALTER TABLE cc_requests ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT 'efectivo';
ALTER TABLE cc_requests ADD COLUMN IF NOT EXISTS started_at    TIMESTAMPTZ;
ALTER TABLE cc_requests ADD COLUMN IF NOT EXISTS toll_amount   BIGINT NOT NULL DEFAULT 0;
ALTER TABLE cc_requests ADD COLUMN IF NOT EXISTS extra_stops_amount BIGINT NOT NULL DEFAULT 0;

-- ── 2. Chat en tiempo real ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES cc_requests(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  role        VARCHAR(15) NOT NULL, -- 'passenger' | 'driver'
  content     TEXT NOT NULL,
  predefined  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_messages_req_idx ON cc_messages(request_id, created_at);

ALTER TABLE cc_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_msg_read ON cc_messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM cc_requests r WHERE r.id = request_id
    AND (r.user_id = auth.uid() OR r.driver_id = auth.uid())
  )
);

CREATE POLICY cc_msg_ins ON cc_messages FOR INSERT WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM cc_requests r WHERE r.id = request_id
    AND (r.user_id = auth.uid() OR r.driver_id = auth.uid())
    AND r.status IN ('accepted','in_progress')
  )
);

-- ── 3. RPC: Enviar mensaje ────────────────────────────────────────
CREATE OR REPLACE FUNCTION cc_send_message(
  p_request_id UUID, p_content TEXT, p_predefined BOOLEAN DEFAULT false
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID; v_role VARCHAR(15);
BEGIN
  SELECT CASE WHEN user_id = auth.uid() THEN 'passenger' ELSE 'driver' END
  INTO v_role FROM cc_requests WHERE id = p_request_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;

  INSERT INTO cc_messages (request_id, sender_id, role, content, predefined)
  VALUES (p_request_id, auth.uid(), v_role, p_content, p_predefined)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- ── 4. RPC: Agregar parada en vivo ────────────────────────────────
CREATE OR REPLACE FUNCTION cc_add_live_stop(
  p_request_id UUID, p_address TEXT, p_extra_price BIGINT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_req cc_requests%ROWTYPE; v_order INT;
BEGIN
  SELECT * INTO v_req FROM cc_requests WHERE id = p_request_id;
  IF v_req.driver_id <> auth.uid() AND v_req.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  SELECT COALESCE(MAX(stop_order), 0) + 1 INTO v_order FROM cc_stops WHERE request_id = p_request_id;
  INSERT INTO cc_stops (request_id, stop_order, address, lat, lng, wait_min, extra_price)
  VALUES (p_request_id, v_order, p_address, 0, 0, 10, p_extra_price);
  UPDATE cc_requests SET
    extra_stops_amount = extra_stops_amount + p_extra_price,
    accepted_price     = COALESCE(accepted_price, suggested_price) + p_extra_price
  WHERE id = p_request_id;
  RETURN true;
END; $$;

-- ── 5. RPC: Marcar inicio (registrar started_at) ──────────────────
CREATE OR REPLACE FUNCTION cc_mark_started(p_request_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE cc_requests SET started_at = now()
  WHERE id = p_request_id AND driver_id = auth.uid() AND started_at IS NULL;
  RETURN FOUND;
END; $$;

-- ── 6. Vista de mensajes del chat ─────────────────────────────────
CREATE OR REPLACE VIEW cc_messages_v AS
SELECT
  m.*,
  au.raw_user_meta_data->>'full_name' AS sender_name,
  (SELECT selfie_url FROM ag_users WHERE auth_user_id = m.sender_id LIMIT 1) AS sender_photo
FROM cc_messages m
LEFT JOIN auth.users au ON au.id = m.sender_id;
