-- ═══════════════════════════════════════════════════════════════
-- 169: MÓDULO FLETES — Tablas core
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Tipos ENUM ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE fl_service_type  AS ENUM ('trasteo','mudanza','flete','comercial','especial');
  CREATE TYPE fl_vehicle_type  AS ENUM ('moto','pickup','van','camion_35t','camion_7t','any');
  CREATE TYPE fl_insurance_type AS ENUM ('none','basic','plus','premium');
  CREATE TYPE fl_req_status    AS ENUM ('draft','published','negotiating','accepted','in_progress','completed','cancelled','disputed');
  CREATE TYPE fl_offer_status  AS ENUM ('pending','accepted','rejected','withdrawn','expired');
  CREATE TYPE fl_milestone_type AS ENUM (
    'published','offer_accepted','transporter_en_route','arrived_origin',
    'loading_started','loading_complete','in_transit',
    'arrived_destination','unloading_started','unloading_complete',
    'client_confirmed','payment_released'
  );
  CREATE TYPE fl_claim_type    AS ENUM ('damage','missing_item','incomplete_service','overcharge','other');
  CREATE TYPE fl_claim_status  AS ENUM ('open','under_review','resolved_refund','resolved_no_refund','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Zonas con surge pricing ────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city        VARCHAR(80)  NOT NULL,
  zone_name   VARCHAR(80)  NOT NULL,
  center_lat  NUMERIC(10,6) NOT NULL,
  center_lng  NUMERIC(10,6) NOT NULL,
  radius_km   NUMERIC(6,2)  NOT NULL DEFAULT 30,
  base_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 3. Reglas de surge ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_surge_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id         UUID REFERENCES fl_zones(id) ON DELETE CASCADE,
  rule_type       VARCHAR(20) NOT NULL, -- 'dow'|'date_range'|'event'
  dow_start       INT,  -- 0=Dom
  dow_end         INT,
  hour_start      INT,
  hour_end        INT,
  date_start      DATE,
  date_end        DATE,
  surge_multiplier NUMERIC(4,2) NOT NULL,
  label           VARCHAR(60),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 4. Transportistas ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_transporters (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name     VARCHAR(120),
  phone            VARCHAR(20),
  selfie_url       TEXT,
  bio              TEXT,
  total_services   INT NOT NULL DEFAULT 0,
  rating_avg       NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count     INT NOT NULL DEFAULT 0,
  is_verified      BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  available_vehicles TEXT[] NOT NULL DEFAULT '{}',
  service_radius_km  INT NOT NULL DEFAULT 25,
  wallet_balance   BIGINT NOT NULL DEFAULT 0,
  total_earnings   BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5. Vehículos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transporter_id  UUID NOT NULL REFERENCES fl_transporters(user_id) ON DELETE CASCADE,
  vehicle_type    fl_vehicle_type NOT NULL,
  brand           VARCHAR(60),
  model           VARCHAR(60),
  year            INT,
  plate           VARCHAR(20),
  color           VARCHAR(40),
  capacity_kg     INT NOT NULL DEFAULT 0,
  capacity_m3     NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_helpers     INT NOT NULL DEFAULT 0,
  photos          TEXT[] NOT NULL DEFAULT '{}',
  is_verified     BOOLEAN NOT NULL DEFAULT false,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 6. Solicitudes de flete ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_type          fl_service_type NOT NULL,
  status                fl_req_status NOT NULL DEFAULT 'draft',

  -- Origen
  origin_address        TEXT NOT NULL,
  origin_lat            NUMERIC(10,6) NOT NULL,
  origin_lng            NUMERIC(10,6) NOT NULL,
  origin_floor          INT NOT NULL DEFAULT 0,
  origin_elevator       BOOLEAN NOT NULL DEFAULT false,
  origin_access_notes   TEXT,

  -- Destino
  dest_address          TEXT NOT NULL,
  dest_lat              NUMERIC(10,6) NOT NULL,
  dest_lng              NUMERIC(10,6) NOT NULL,
  dest_floor            INT NOT NULL DEFAULT 0,
  dest_elevator         BOOLEAN NOT NULL DEFAULT false,
  dest_access_notes     TEXT,

  -- Medidas
  distance_km           NUMERIC(8,2) NOT NULL DEFAULT 0,
  estimated_volume_m3   NUMERIC(8,2) NOT NULL DEFAULT 0,
  estimated_weight_kg   INT NOT NULL DEFAULT 0,
  total_items_count     INT NOT NULL DEFAULT 0,
  special_items         TEXT[] NOT NULL DEFAULT '{}',

  -- Requisitos
  vehicle_type_required fl_vehicle_type NOT NULL DEFAULT 'any',
  helpers_needed        INT NOT NULL DEFAULT 0,
  needs_disassembly     BOOLEAN NOT NULL DEFAULT false,
  needs_assembly        BOOLEAN NOT NULL DEFAULT false,
  fragile_items         BOOLEAN NOT NULL DEFAULT false,
  passenger_note        TEXT,

  -- Horario
  scheduled_date        DATE NOT NULL,
  scheduled_time_window VARCHAR(20) NOT NULL DEFAULT 'flexible',

  -- Precios
  suggested_price       BIGINT NOT NULL DEFAULT 0,
  accepted_price        BIGINT,
  surge_factor          NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  surge_label           VARCHAR(60),

  -- Seguro
  insurance_type        fl_insurance_type NOT NULL DEFAULT 'basic',
  insurance_premium     BIGINT NOT NULL DEFAULT 0,
  insurance_coverage    BIGINT NOT NULL DEFAULT 200000,

  -- Pago
  deposit_amount        BIGINT NOT NULL DEFAULT 0,
  deposit_paid          BOOLEAN NOT NULL DEFAULT false,
  deposit_tx_id         TEXT,
  final_payment_paid    BOOLEAN NOT NULL DEFAULT false,

  -- Fotos
  photos_items          TEXT[] NOT NULL DEFAULT '{}',
  photos_origin_access  TEXT[] NOT NULL DEFAULT '{}',
  photos_dest_access    TEXT[] NOT NULL DEFAULT '{}',
  photos_before         TEXT[] NOT NULL DEFAULT '{}',
  photos_after          TEXT[] NOT NULL DEFAULT '{}',

  -- Transportista asignado
  transporter_id        UUID REFERENCES fl_transporters(user_id) ON DELETE SET NULL,
  accepted_offer_id     UUID,

  -- Zona
  zone_id               UUID REFERENCES fl_zones(id),

  -- Cancelación
  cancelled_at          TIMESTAMPTZ,
  cancel_reason         TEXT,
  cancelled_by          VARCHAR(20),

  -- Completado
  requester_confirmed_at TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fl_requests_user_id_idx     ON fl_requests(user_id);
CREATE INDEX IF NOT EXISTS fl_requests_status_idx      ON fl_requests(status);
CREATE INDEX IF NOT EXISTS fl_requests_scheduled_idx   ON fl_requests(scheduled_date);
CREATE INDEX IF NOT EXISTS fl_requests_transporter_idx ON fl_requests(transporter_id);

-- ── 7. Ofertas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fl_offers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id           UUID NOT NULL REFERENCES fl_requests(id) ON DELETE CASCADE,
  transporter_id       UUID NOT NULL REFERENCES fl_transporters(user_id) ON DELETE CASCADE,
  vehicle_id           UUID REFERENCES fl_vehicles(id),
  status               fl_offer_status NOT NULL DEFAULT 'pending',
  offered_price        BIGINT NOT NULL,
  helpers_included     INT NOT NULL DEFAULT 0,
  estimated_hours      NUMERIC(4,1),
  presentation_text    TEXT,
  availability_dt      TIMESTAMPTZ,
  counter_offers       JSONB NOT NULL DEFAULT '[]',
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '4 hours'),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fl_offers_request_idx     ON fl_offers(request_id);
CREATE INDEX IF NOT EXISTS fl_offers_transporter_idx ON fl_offers(transporter_id);

-- ── 8. Trigger updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION fl_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER fl_requests_updated_at
  BEFORE UPDATE ON fl_requests
  FOR EACH ROW EXECUTE FUNCTION fl_set_updated_at();

-- ── 9. Seed zonas Colombia ───────────────────────────────────────
INSERT INTO fl_zones (city, zone_name, center_lat, center_lng, radius_km) VALUES
  ('Medellín',     'Valle de Aburrá',   6.2442,   -75.5812, 35),
  ('Bogotá',       'Bogotá D.C.',       4.7110,   -74.0721, 40),
  ('Cali',         'Santiago de Cali',  3.4516,   -76.5320, 30),
  ('Barranquilla', 'Barranquilla',      10.9685,  -74.7813, 25),
  ('Cartagena',    'Cartagena',         10.3910,  -75.4794, 25),
  ('Bucaramanga',  'Área Metropolitana',7.1193,   -73.1227, 25),
  ('Pereira',      'Pereira',           4.8143,   -75.6946, 20)
ON CONFLICT DO NOTHING;

-- Surge reglas
INSERT INTO fl_surge_rules (rule_type, dow_start, dow_end, surge_multiplier, label, is_active) VALUES
  ('dow', 6, 0, 1.20, '⚡ Fin de semana', true)
ON CONFLICT DO NOTHING;

-- ── 10. RLS ──────────────────────────────────────────────────────
ALTER TABLE fl_zones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE fl_surge_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fl_transporters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE fl_vehicles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fl_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE fl_offers        ENABLE ROW LEVEL SECURITY;

-- Zonas: lectura pública
CREATE POLICY fl_zones_read      ON fl_zones         FOR SELECT USING (true);
CREATE POLICY fl_surge_read      ON fl_surge_rules   FOR SELECT USING (true);

-- Transportistas: lectura pública, write propio
CREATE POLICY fl_trans_read      ON fl_transporters  FOR SELECT USING (true);
CREATE POLICY fl_trans_own_ins   ON fl_transporters  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY fl_trans_own_upd   ON fl_transporters  FOR UPDATE USING (user_id = auth.uid());

-- Vehículos
CREATE POLICY fl_veh_read        ON fl_vehicles      FOR SELECT USING (true);
CREATE POLICY fl_veh_own_ins     ON fl_vehicles      FOR INSERT WITH CHECK (transporter_id = auth.uid());
CREATE POLICY fl_veh_own_upd     ON fl_vehicles      FOR UPDATE USING (transporter_id = auth.uid());
CREATE POLICY fl_veh_own_del     ON fl_vehicles      FOR DELETE USING (transporter_id = auth.uid());

-- Solicitudes: owner + transportista asignado
CREATE POLICY fl_req_own_read    ON fl_requests      FOR SELECT USING (
  user_id = auth.uid() OR transporter_id = auth.uid()
);
CREATE POLICY fl_req_published_r ON fl_requests      FOR SELECT USING (status IN ('published','negotiating'));
CREATE POLICY fl_req_own_ins     ON fl_requests      FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY fl_req_own_upd     ON fl_requests      FOR UPDATE USING (
  user_id = auth.uid() OR transporter_id = auth.uid()
);

-- Ofertas: transportista ve las suyas, solicitante ve las de su solicitud
CREATE POLICY fl_offer_read      ON fl_offers        FOR SELECT USING (
  transporter_id = auth.uid()
  OR EXISTS (SELECT 1 FROM fl_requests r WHERE r.id = request_id AND r.user_id = auth.uid())
);
CREATE POLICY fl_offer_ins       ON fl_offers        FOR INSERT WITH CHECK (transporter_id = auth.uid());
CREATE POLICY fl_offer_upd       ON fl_offers        FOR UPDATE USING (
  transporter_id = auth.uid()
  OR EXISTS (SELECT 1 FROM fl_requests r WHERE r.id = request_id AND r.user_id = auth.uid())
);
