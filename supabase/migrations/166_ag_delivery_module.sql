-- ===================================================================
-- 166_ag_delivery_module.sql — Módulo domicilios Movi
-- ===================================================================

CREATE TABLE IF NOT EXISTS ag_delivery_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id          UUID NOT NULL,
  delivery_type         TEXT NOT NULL DEFAULT 'pickup_and_deliver',
  -- Punto de recogida
  pickup_name           TEXT NOT NULL,
  pickup_lat            DOUBLE PRECISION NOT NULL,
  pickup_lng            DOUBLE PRECISION NOT NULL,
  pickup_contact_name   TEXT,
  pickup_contact_phone  TEXT,
  -- Punto de entrega
  delivery_name         TEXT NOT NULL,
  delivery_lat          DOUBLE PRECISION NOT NULL,
  delivery_lng          DOUBLE PRECISION NOT NULL,
  delivery_contact_name  TEXT,
  delivery_contact_phone TEXT,
  -- Paquete
  package_description   TEXT NOT NULL,
  package_size          TEXT NOT NULL DEFAULT 'small',
  special_instructions  TEXT,
  -- Precio
  offered_price         INTEGER NOT NULL DEFAULT 0,
  distance_km           NUMERIC(6,2),
  -- Estado
  status                TEXT NOT NULL DEFAULT 'searching',
  driver_stage          TEXT,
  -- Conductor asignado
  driver_id             UUID,
  -- Pago
  payment_method        TEXT NOT NULL DEFAULT 'cash',
  -- Fotos de confirmación
  pickup_photo_url      TEXT,
  delivery_photo_url    TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ag_delivery_offers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id  UUID NOT NULL REFERENCES ag_delivery_requests(id) ON DELETE CASCADE,
  driver_id            UUID NOT NULL,
  offered_price        INTEGER NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ag_delivery_requests REPLICA IDENTITY FULL;
ALTER TABLE ag_delivery_offers   REPLICA IDENTITY FULL;

ALTER TABLE ag_delivery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ag_delivery_offers   ENABLE ROW LEVEL SECURITY;

-- Políticas ag_delivery_requests
CREATE POLICY "agdr_select" ON ag_delivery_requests FOR SELECT USING (
  passenger_id = (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
  OR status = 'searching'
  OR driver_id = (SELECT d.id FROM ag_drivers d JOIN ag_users u ON u.id = d.user_id WHERE u.auth_user_id = auth.uid() LIMIT 1)
);
CREATE POLICY "agdr_insert" ON ag_delivery_requests FOR INSERT WITH CHECK (
  passenger_id = (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
);
CREATE POLICY "agdr_update" ON ag_delivery_requests FOR UPDATE USING (
  passenger_id = (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
  OR driver_id = (SELECT d.id FROM ag_drivers d JOIN ag_users u ON u.id = d.user_id WHERE u.auth_user_id = auth.uid() LIMIT 1)
);

-- Políticas ag_delivery_offers
CREATE POLICY "agdo_select" ON ag_delivery_offers FOR SELECT USING (
  driver_id = (SELECT d.id FROM ag_drivers d JOIN ag_users u ON u.id = d.user_id WHERE u.auth_user_id = auth.uid() LIMIT 1)
  OR delivery_request_id IN (
    SELECT id FROM ag_delivery_requests WHERE passenger_id = (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
  )
);
CREATE POLICY "agdo_insert" ON ag_delivery_offers FOR INSERT WITH CHECK (
  driver_id = (SELECT d.id FROM ag_drivers d JOIN ag_users u ON u.id = d.user_id WHERE u.auth_user_id = auth.uid() LIMIT 1)
);
CREATE POLICY "agdo_update" ON ag_delivery_offers FOR UPDATE USING (
  driver_id = (SELECT d.id FROM ag_drivers d JOIN ag_users u ON u.id = d.user_id WHERE u.auth_user_id = auth.uid() LIMIT 1)
  OR delivery_request_id IN (
    SELECT id FROM ag_delivery_requests WHERE passenger_id = (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
  )
);

-- Storage bucket para fotos
INSERT INTO storage.buckets (id, name, public) VALUES ('movi-delivery-photos', 'movi-delivery-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "delivery_photos_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'movi-delivery-photos');
CREATE POLICY "delivery_photos_select" ON storage.objects FOR SELECT USING (bucket_id = 'movi-delivery-photos');
