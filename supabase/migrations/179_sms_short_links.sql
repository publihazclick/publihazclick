-- =============================================================================
-- Migration 179: Acortador de links SMS con tracking de clics
-- =============================================================================

CREATE TABLE IF NOT EXISTS sms_short_links (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id     uuid        REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  code            text        NOT NULL UNIQUE,
  destination_url text        NOT NULL,
  click_count     integer     NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_short_links_campaign ON sms_short_links(campaign_id);

ALTER TABLE sms_short_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sees_own_sms_short_links" ON sms_short_links;
CREATE POLICY "user_sees_own_sms_short_links" ON sms_short_links FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "service_manages_sms_short_links" ON sms_short_links;
CREATE POLICY "service_manages_sms_short_links" ON sms_short_links FOR ALL
  USING (true) WITH CHECK (true);

-- ── Registro individual de cada clic (para futuras métricas: hora, dispositivo) ──
CREATE TABLE IF NOT EXISTS sms_short_link_clicks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  short_link_id  uuid        NOT NULL REFERENCES sms_short_links(id) ON DELETE CASCADE,
  clicked_at     timestamptz DEFAULT now(),
  user_agent     text
);

CREATE INDEX IF NOT EXISTS idx_sms_short_link_clicks_link ON sms_short_link_clicks(short_link_id);

ALTER TABLE sms_short_link_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sees_own_sms_short_link_clicks" ON sms_short_link_clicks;
CREATE POLICY "user_sees_own_sms_short_link_clicks" ON sms_short_link_clicks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sms_short_links l
    WHERE l.id = sms_short_link_clicks.short_link_id AND l.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "service_manages_sms_short_link_clicks" ON sms_short_link_clicks;
CREATE POLICY "service_manages_sms_short_link_clicks" ON sms_short_link_clicks FOR ALL
  USING (true) WITH CHECK (true);

-- ── Función: registra el clic y devuelve la URL destino (usada por el edge function público) ──
CREATE OR REPLACE FUNCTION sms_short_link_register_click(p_code text, p_user_agent text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id   uuid;
  v_dest text;
BEGIN
  SELECT id, destination_url INTO v_id, v_dest FROM sms_short_links WHERE code = p_code;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE sms_short_links SET click_count = click_count + 1 WHERE id = v_id;
  INSERT INTO sms_short_link_clicks (short_link_id, user_agent) VALUES (v_id, p_user_agent);

  RETURN v_dest;
END;
$$;
