-- ═══════════════════════════════════════════════════════════════
-- 170: MÓDULO FLETES — Items, hitos, seguro, reclamos, ratings
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Items del inventario ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES fl_requests(id) ON DELETE CASCADE,
  category       VARCHAR(30) NOT NULL DEFAULT 'otro',
  name           VARCHAR(120) NOT NULL,
  quantity       INT NOT NULL DEFAULT 1,
  is_fragile     BOOLEAN NOT NULL DEFAULT false,
  special_type   VARCHAR(30),
  est_weight_kg  NUMERIC(8,2) NOT NULL DEFAULT 0,
  est_volume_m3  NUMERIC(8,2) NOT NULL DEFAULT 0,
  photo_url      TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fl_items_request_idx ON fl_items(request_id);

ALTER TABLE fl_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY fl_items_read ON fl_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM fl_requests r WHERE r.id = request_id AND (
    r.user_id = auth.uid() OR r.transporter_id = auth.uid() OR r.status IN ('published','negotiating')
  ))
);
CREATE POLICY fl_items_ins ON fl_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM fl_requests r WHERE r.id = request_id AND r.user_id = auth.uid())
);
CREATE POLICY fl_items_del ON fl_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM fl_requests r WHERE r.id = request_id AND r.user_id = auth.uid())
);

-- ── 2. Hitos del servicio ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_milestones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES fl_requests(id) ON DELETE CASCADE,
  milestone_type fl_milestone_type NOT NULL,
  completed_at   TIMESTAMPTZ,
  photos         TEXT[] NOT NULL DEFAULT '{}',
  notes          TEXT,
  lat            NUMERIC(10,6),
  lng            NUMERIC(10,6),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fl_milestones_unique ON fl_milestones(request_id, milestone_type);
CREATE INDEX IF NOT EXISTS fl_milestones_request_idx ON fl_milestones(request_id);

ALTER TABLE fl_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY fl_milestones_read ON fl_milestones FOR SELECT USING (
  EXISTS (SELECT 1 FROM fl_requests r WHERE r.id = request_id AND (
    r.user_id = auth.uid() OR r.transporter_id = auth.uid()
  ))
);
CREATE POLICY fl_milestones_ins ON fl_milestones FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM fl_requests r WHERE r.id = request_id AND (
    r.user_id = auth.uid() OR r.transporter_id = auth.uid()
  ))
);
CREATE POLICY fl_milestones_upd ON fl_milestones FOR UPDATE USING (
  EXISTS (SELECT 1 FROM fl_requests r WHERE r.id = request_id AND (
    r.user_id = auth.uid() OR r.transporter_id = auth.uid()
  ))
);

-- ── 3. Reclamos / disputas ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_claims (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES fl_requests(id) ON DELETE CASCADE,
  claimant_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_type       fl_claim_type NOT NULL,
  description      TEXT NOT NULL,
  claimed_amount   BIGINT NOT NULL DEFAULT 0,
  evidence_photos  TEXT[] NOT NULL DEFAULT '{}',
  status           fl_claim_status NOT NULL DEFAULT 'open',
  admin_notes      TEXT,
  resolution_amount BIGINT,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fl_claims_request_idx   ON fl_claims(request_id);
CREATE INDEX IF NOT EXISTS fl_claims_claimant_idx  ON fl_claims(claimant_id);

ALTER TABLE fl_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY fl_claims_read ON fl_claims FOR SELECT USING (
  claimant_id = auth.uid()
  OR EXISTS (SELECT 1 FROM fl_requests r WHERE r.id = request_id AND (
    r.user_id = auth.uid() OR r.transporter_id = auth.uid()
  ))
);
CREATE POLICY fl_claims_ins ON fl_claims FOR INSERT WITH CHECK (claimant_id = auth.uid());

-- ── 4. Calificaciones ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES fl_requests(id) ON DELETE CASCADE,
  rater_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ratee_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rater_role      VARCHAR(15) NOT NULL, -- 'requester'|'transporter'
  -- Scores 1-5 (requester → transporter)
  punctuality     INT,
  item_care       INT,
  professionalism INT,
  communication   INT,
  value_for_money INT,
  -- Scores 1-5 (transporter → requester)
  access_ease     INT,
  info_accuracy   INT,
  client_behavior INT,
  -- Común
  overall_avg     NUMERIC(3,2) NOT NULL DEFAULT 0,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fl_ratings_unique ON fl_ratings(request_id, rater_id);
CREATE INDEX IF NOT EXISTS fl_ratings_ratee_idx ON fl_ratings(ratee_id);

ALTER TABLE fl_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY fl_ratings_read ON fl_ratings FOR SELECT USING (true);
CREATE POLICY fl_ratings_ins  ON fl_ratings FOR INSERT WITH CHECK (rater_id = auth.uid());

-- ── 5. Notificaciones ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id  UUID REFERENCES fl_requests(id) ON DELETE CASCADE,
  type        VARCHAR(40) NOT NULL,
  message     TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fl_notif_user_idx ON fl_notifications(user_id, is_read);

ALTER TABLE fl_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY fl_notif_own ON fl_notifications FOR ALL USING (user_id = auth.uid());

-- ── 6. Storage buckets ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('fl-items',    'fl-items',    true,  5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('fl-service',  'fl-service',  true,  5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('fl-vehicles', 'fl-vehicles', true,  5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY fl_items_bucket_ins ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'fl-items' AND auth.uid() IS NOT NULL
);
CREATE POLICY fl_items_bucket_sel ON storage.objects FOR SELECT USING (bucket_id = 'fl-items');
CREATE POLICY fl_service_bucket_ins ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'fl-service' AND auth.uid() IS NOT NULL
);
CREATE POLICY fl_service_bucket_sel ON storage.objects FOR SELECT USING (bucket_id = 'fl-service');
CREATE POLICY fl_veh_bucket_ins ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'fl-vehicles' AND auth.uid() IS NOT NULL
);
CREATE POLICY fl_veh_bucket_sel ON storage.objects FOR SELECT USING (bucket_id = 'fl-vehicles');
